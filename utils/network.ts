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
      // Create a peer with a random ID (or specified one if we wanted persistence)
      this.peer = new Peer(id);

      this.peer.on('open', (id) => {
        this.myId = id;
        console.log('My Peer ID is: ' + id);
        resolve(id);
      });

      this.peer.on('connection', (conn) => {
        // Host receives connection
        this.handleConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.error(err);
        this.onError(err.type);
        reject(err);
      });
    });
  }

  connect(hostId: string) {
    if (!this.peer) return;
    const conn = this.peer.connect(hostId);
    this.handleConnection(conn);
  }

  handleConnection(conn: DataConnection) {
    this.conn = conn;
    
    conn.on('open', () => {
      console.log('Connected!');
      this.onConnect();
    });

    conn.on('data', (data: any) => {
      this.onMessage(data as NetworkMessage);
    });

    conn.on('close', () => {
      console.log('Connection closed');
      this.onDisconnect();
    });

    conn.on('error', (err) => {
      console.error('Connection error:', err);
      this.onError(err.type);
    });
  }

  send(type: NetworkMsgType, payload: any) {
    if (this.conn && this.conn.open) {
      this.conn.send({
        type,
        payload,
        timestamp: Date.now()
      } as NetworkMessage);
    }
  }

  destroy() {
    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }
}
