import Peer, { DataConnection } from 'peerjs';
import { NetworkMessage, NetworkMsgType } from '../types';

export class NetworkManager {
  peer: Peer | null = null;
  conn: DataConnection | null = null;
  
  onMessage: (msg: NetworkMessage) => void = () => {};
  onConnect: () => void = () => {};
  onDisconnect: () => void = () => {};
  onError: (err: string) => void = () => {};

  isHost: boolean = false;
  myId: string = '';

  constructor() {}

  initialize(id?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        // Create a peer with a random ID (or specified one if we wanted persistence)
        this.peer = new Peer(id, {
          debug: 0 // Disable verbose logging in production
        });

        // Add timeout for initialization (imported from constants would be better, but avoiding circular dependency)
        const CONNECTION_TIMEOUT = 10000;
        const timeout = setTimeout(() => {
          reject(new Error('Peer connection timeout'));
          this.onError('Connection timeout');
        }, CONNECTION_TIMEOUT);

        this.peer.on('open', (id) => {
          clearTimeout(timeout);
          this.myId = id;
          console.log('My Peer ID is: ' + id);
          resolve(id);
        });

        this.peer.on('connection', (conn) => {
          // Host receives connection
          this.handleConnection(conn);
        });

        this.peer.on('error', (err) => {
          clearTimeout(timeout);
          console.error('Peer error:', err);
          this.onError(err.type || 'Unknown error');
          reject(err);
        });

        this.peer.on('disconnected', () => {
          console.log('Peer disconnected, attempting to reconnect...');
          // Attempt reconnection
          if (this.peer && !this.peer.destroyed) {
            this.peer.reconnect();
          }
        });
      } catch (err) {
        console.error('Failed to create peer:', err);
        reject(err);
      }
    });
  }

  connect(hostId: string) {
    if (!this.peer) {
      this.onError('Peer not initialized');
      return;
    }
    
    try {
      const conn = this.peer.connect(hostId, {
        reliable: true
      });
      this.handleConnection(conn);
    } catch (err) {
      console.error('Failed to connect:', err);
      this.onError('Connection failed');
    }
  }

  handleConnection(conn: DataConnection) {
    this.conn = conn;
    
    conn.on('open', () => {
      console.log('Connected!');
      this.onConnect();
    });

    conn.on('data', (data: any) => {
      try {
        // Validate message structure
        if (data && typeof data === 'object' && 'type' in data && 'payload' in data) {
          this.onMessage(data as NetworkMessage);
        } else {
          console.warn('Received invalid message format:', data);
        }
      } catch (err) {
        console.error('Error processing message:', err);
      }
    });

    conn.on('close', () => {
      console.log('Connection closed');
      this.onDisconnect();
    });

    conn.on('error', (err) => {
      console.error('Connection error:', err);
      this.onError(err.type || 'Connection error');
    });
  }

  send(type: NetworkMsgType, payload: any) {
    if (this.conn && this.conn.open) {
      try {
        this.conn.send({
          type,
          payload,
          timestamp: Date.now()
        } as NetworkMessage);
      } catch (err) {
        console.error('Failed to send message:', err);
      }
    } else {
      console.warn('Cannot send message: connection not open');
    }
  }

  destroy() {
    try {
      if (this.conn) {
        this.conn.close();
        this.conn = null;
      }
      if (this.peer) {
        this.peer.destroy();
        this.peer = null;
      }
    } catch (err) {
      console.error('Error during cleanup:', err);
    }
  }
}
