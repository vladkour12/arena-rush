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
        // Clean up any existing peer before creating new one
        if (this.peer && !this.peer.destroyed) {
          try {
            this.peer.destroy();
          } catch (e) {
            console.warn('Error destroying old peer:', e);
          }
        }
        
        // Create a peer with better configuration for reliability
        this.peer = new Peer(id, {
          debug: 0, // Disable verbose logging in production
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' }
            ]
          }
        });

        // Add timeout for initialization
        const CONNECTION_TIMEOUT = 15000; // Increased from 10s to 15s
        let timeoutId: NodeJS.Timeout | null = null;
        let isResolved = false;
        
        timeoutId = setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            const error = new Error('Peer connection timeout - please check your internet connection');
            console.error('Connection timeout');
            this.onError('Connection timeout - please check your internet connection');
            reject(error);
          }
        }, CONNECTION_TIMEOUT);

        this.peer.on('open', (id) => {
          if (timeoutId) clearTimeout(timeoutId);
          if (!isResolved) {
            isResolved = true;
            this.myId = id;
            console.log('My Peer ID is: ' + id);
            resolve(id);
          }
        });

        this.peer.on('connection', (conn) => {
          // Host receives connection
          console.log('Incoming connection from:', conn.peer);
          this.handleConnection(conn);
        });

        this.peer.on('error', (err) => {
          if (timeoutId) clearTimeout(timeoutId);
          console.error('Peer error:', err);
          
          // Provide more helpful error messages
          let errorMsg = 'Connection error';
          if (err.type === 'peer-unavailable') {
            errorMsg = 'Could not connect to friend - please check the ID is correct';
          } else if (err.type === 'network') {
            errorMsg = 'Network error - please check your internet connection';
          } else if (err.type === 'server-error') {
            errorMsg = 'Server error - please try again';
          } else {
            errorMsg = err.message || err.type || 'Unknown error';
          }
          
          this.onError(errorMsg);
          if (!isResolved) {
            isResolved = true;
            reject(err);
          }
        });

        this.peer.on('disconnected', () => {
          console.log('Peer disconnected, attempting to reconnect...');
          // Attempt reconnection only if not destroyed
          if (this.peer && !this.peer.destroyed) {
            try {
              this.peer.reconnect();
            } catch (e) {
              console.error('Reconnection failed:', e);
            }
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
    
    if (!hostId || hostId.trim().length === 0) {
      this.onError('Invalid host ID');
      return;
    }
    
    try {
      console.log('Attempting to connect to:', hostId);
      const conn = this.peer.connect(hostId, {
        reliable: true,
        serialization: 'json'
      });
      
      // Add connection timeout
      const connectionTimeout = setTimeout(() => {
        if (conn && !conn.open) {
          console.error('Connection attempt timed out');
          this.onError('Connection timed out - host may not be available');
          try {
            conn.close();
          } catch (e) {
            console.warn('Error closing timed out connection:', e);
          }
        }
      }, 15000); // 15 second timeout
      
      conn.on('open', () => {
        clearTimeout(connectionTimeout);
        console.log('Connection opened successfully');
      });
      
      this.handleConnection(conn);
    } catch (err) {
      console.error('Failed to connect:', err);
      this.onError('Connection failed - please try again');
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
        // Optimize payload by removing unnecessary data
        const optimizedPayload = this.optimizePayload(type, payload);
        this.conn.send({
          type,
          payload: optimizedPayload,
          timestamp: Date.now()
        } as NetworkMessage);
      } catch (err) {
        console.error('Failed to send message:', err);
      }
    } else {
      console.warn('Cannot send message: connection not open');
    }
  }

  /**
   * Optimizes network payload to reduce bandwidth usage
   * - Rounds numeric values to reduce precision
   * - Removes undefined/zero values to reduce payload size
   * - Only sends essential state data for game synchronization
   * @param type The type of network message
   * @param payload The raw payload data
   * @returns Optimized payload with reduced size
   */
  private optimizePayload(type: NetworkMsgType, payload: any): any {
    if (type === NetworkMsgType.State) {
      // Only send essential state data
      return {
        players: payload.players?.map((p: any) => ({
          id: p.id,
          position: { x: Math.round(p.position.x), y: Math.round(p.position.y) },
          hp: Math.round(p.hp),
          armor: Math.round(p.armor),
          angle: p.angle,
          weapon: p.weapon,
          ammo: p.ammo,
          isReloading: p.isReloading,
          sprintTime: p.sprintTime > 0 ? Math.round(p.sprintTime) : 0,
          dashTime: p.dashTime > 0 ? Math.round(p.dashTime) : 0,
          speedMultiplier: p.speedMultiplier !== 1 ? p.speedMultiplier : 1,
          invulnerable: p.invulnerable > 0 ? Math.round(p.invulnerable) : 0
        })),
        bullets: payload.bullets?.map((b: any) => ({
          id: b.id,
          position: { x: Math.round(b.position.x), y: Math.round(b.position.y) },
          velocity: { x: Math.round(b.velocity.x * 10) / 10, y: Math.round(b.velocity.y * 10) / 10 },
          damage: b.damage,
          ownerId: b.ownerId,
          color: b.color
        })),
        loot: payload.loot?.map((l: any) => ({
          id: l.id,
          type: l.type,
          position: { x: Math.round(l.position.x), y: Math.round(l.position.y) },
          weaponType: l.weaponType,
          value: l.value
        })),
        zoneRadius: Math.round(payload.zoneRadius),
        timeRemaining: Math.round(payload.timeRemaining)
      };
    }
    return payload;
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
