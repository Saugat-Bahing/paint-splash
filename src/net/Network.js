export class Network {
  constructor({ onMessage, onOpen, onClose }) {
    this.onMessage = onMessage;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.socket = null;
    this.connection = null;
  }

  connect() {
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.connection) return this.connection;

    this.connection = new Promise((resolve, reject) => {
      const protocol = location.protocol === "https:" ? "wss" : "ws";
      const socket = new WebSocket(`${protocol}://${location.host}/ws`);
      this.socket = socket;

      socket.addEventListener("open", () => {
        this.connection = null;
        this.onOpen?.();
        resolve();
      });
      socket.addEventListener("message", (event) => {
        try {
          this.onMessage?.(JSON.parse(event.data));
        } catch (error) {
          console.error("Invalid server message:", error);
        }
      });
      socket.addEventListener("error", () => {
        if (this.connection) {
          this.connection = null;
          reject(new Error("Could not connect to the game server."));
        }
      });
      socket.addEventListener("close", () => {
        this.connection = null;
        if (this.socket === socket) this.socket = null;
        this.onClose?.();
      });
    });

    return this.connection;
  }

  send(message) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }
}
