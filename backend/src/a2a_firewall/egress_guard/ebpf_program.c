// SPDX-License-Identifier: Apache-2.0
/*
 * A2A Firewall — Layer 3 Kernel-Level Socket Egress Enforcement (eBPF)
 *
 * Attaches to cgroup/connect4 to inspect all outbound IPv4 TCP connect() syscalls.
 * Enforces that agent processes must route outbound traffic strictly through
 * the local A2A proxy (127.0.0.1:8080) or allowed internal mesh IPs.
 *
 * Any unproxied direct connection attempt is dropped at the kernel boundary.
 */

#include <linux/bpf.h>
#include <linux/in.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

#define PROXY_PORT 8080
#define LOOPBACK_IPV4 0x7F000001 /* 127.0.0.1 in network byte order */
#define A2A_FWMARK 0xA2A1        /* sockets marked by the proxy itself are exempt */

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 1024);
    __type(key, __u32);   /* PID */
    __type(value, __u8);  /* 1 = Enforce Proxy Routing */
} monitored_pids SEC(".maps");

/* PIDs excluded from enforcement (e.g. the A2A proxy's own process).
 * The proxy's own outbound connections must never be redirected back into
 * itself — that would cause an infinite loop. This is the user-space
 * complement to the fwmark check below. */
struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 64);
    __type(key, __u32);   /* PID */
    __type(value, __u8);  /* 1 = Exempt */
} exempt_pids SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_PERF_EVENT_ARRAY);
    __uint(key_size, sizeof(__u32));
    __uint(value_size, sizeof(__u32));
} bypass_events SEC(".maps");

struct bypass_alert_t {
    __u32 pid;
    __u32 dest_ip;
    __u16 dest_port;
    __u8  dropped;
};

SEC("cgroup/connect4")
int a2a_sock_connect4(struct bpf_sock_addr *ctx) {
    __u64 pid_tgid = bpf_get_current_pid_tgid();
    __u32 pid = pid_tgid >> 32;

    // Loop-avoidance: never intercept the A2A proxy's own sockets.
    // 1. The proxy marks its own outbound sockets with A2A_FWMARK (set via
    //    SO_MARK in user-space) so the iptables REDIRECT skips them.
    // 2. As a defence-in-depth, the proxy's own PID in exempt_pids is also
    //    skipped even for cgroup attachment.
    if (ctx->mark == A2A_FWMARK) {
        return 1; // ALLOW (proxy's own traffic, prevent feedback loop)
    }
    __u8 *is_exempt = bpf_map_lookup_elem(&exempt_pids, &pid);
    if (is_exempt && *is_exempt == 1) {
        return 1; // ALLOW (explicit exemption)
    }

    // Check if this PID is monitored by A2A Firewall
    __u8 *is_monitored = bpf_map_lookup_elem(&monitored_pids, &pid);
    if (!is_monitored || *is_monitored == 0) {
        return 1; // Allow non-agent processes
    }

    __u32 dst_ip = ctx->user_ip4;
    __u16 dst_port = bpf_ntohs((__u16)ctx->user_port);

    // Rule 1: Allow connections to the local A2A proxy (127.0.0.1:8080)
    if (dst_ip == bpf_htonl(LOOPBACK_IPV4) && dst_port == PROXY_PORT) {
        return 1; // ALLOW
    }

    // Rule 2: Allow loopback DNS (127.0.0.1:53 or 127.0.0.53:53)
    if ((dst_ip == bpf_htonl(LOOPBACK_IPV4) || dst_ip == bpf_htonl(0x7F000035)) && dst_port == 53) {
        return 1; // ALLOW DNS
    }

    // Rule 3: Any direct connection to public IP / third-party API bypassing proxy -> DROP & ALERT
    struct bypass_alert_t alert = {
        .pid = pid,
        .dest_ip = dst_ip,
        .dest_port = dst_port,
        .dropped = 1,
    };
    bpf_perf_event_output(ctx, &bypass_events, BPF_F_CURRENT_CPU, &alert, sizeof(alert));

    // Drop connection at kernel level!
    return 0; // REJECT (EPERM)
}

char _license[] SEC("license") = "GPL";
