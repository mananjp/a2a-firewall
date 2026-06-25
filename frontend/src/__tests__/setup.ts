import "@testing-library/jest-dom";

// Silence ReactFlow's React warning about findDOMNode in jsdom.
const origError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const msg = String(args[0] ?? "");
    if (msg.includes("not wrapped in act") || msg.includes("Warning:")) return;
    origError(...args);
  };
});
afterAll(() => {
  console.error = origError;
});
