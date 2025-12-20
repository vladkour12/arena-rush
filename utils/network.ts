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
        
        // Create a peer with enhanced configuration for better reliability
        this.peer = new Peer(id, {
          debug: 0, // Disable verbose logging in production
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' }
            ],
            // Enable aggressive ICE nomination for faster connections
            iceTransportPolicy: 'all',
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require',
            // Optimize for low latency
            sdpSemantics: 'unified-plan'
          },
          // Reduce ping interval for better connection stability without excessive traffic
          pingInterval: 3000, // Reduced from 5000 for faster keepalive
          // Add serialization config for better performance
          serialization: 'json'
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
        serialization: 'json',
        metadata: { timestamp: Date.now() } // Add metadata for tracking
      });
      
      // Add connection timeout with better error handling
      const connectionTimeout = setTimeout(() => {
        if (conn && !conn.open) {
          console.error('Connection attempt timed out after 20 seconds');
          this.onError('Connection timed out - please ensure host is in lobby and try again');
          try {
            conn.close();
          } catch (e) {
            console.warn('Error closing timed out connection:', e);
          }
        }
      }, 20000); // Increased to 20 second timeout
      
      conn.on('open', () => {
        clearTimeout(connectionTimeout);
        console.log('Connection opened successfully to:', hostId);
      });
      
      // Add error handler before handleConnection
      conn.on('error', (err) => {
        clearTimeout(connectionTimeout);
        console.error('Connection error during establishment:', err);
        this.onError('Failed to establish connection - please try again');
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
      // Only send essential state data with aggressive optimization
      return {
        players: payload.players?.map((p: any) => ({
          id: p.id,
          position: { x: Math.round(p.position.x), y: Math.round(p.position.y) },
          hp: Math.round(p.hp),
          armor: Math.round(p.armor),
          angle: Math.round(p.angle * 100) / 100, // Round angle to 2 decimals
          weapon: p.weapon,
          ammo: p.ammo,
          // Only send fields that are non-default to reduce payload
          ...(p.isReloading && { isReloading: true }),
          ...(p.sprintTime > 0 && { sprintTime: Math.round(p.sprintTime) }),
          ...(p.dashTime > 0 && { dashTime: Math.round(p.dashTime) }),
          ...(p.speedMultiplier !== 1 && { speedMultiplier: Math.round(p.speedMultiplier * 100) / 100 }),
          ...(p.invulnerable > 0 && { invulnerable: Math.round(p.invulnerable) })
        })),
        // Limit bullets to most recent to reduce payload
        bullets: payload.bullets?.slice(-50).map((b: any) => ({
          id: b.id,
          position: { x: Math.round(b.position.x), y: Math.round(b.position.y) },
          velocity: { x: Math.round(b.velocity.x * 10) / 10, y: Math.round(b.velocity.y * 10) / 10 },
          damage: b.damage,
          ownerId: b.ownerId,
          ...(b.color !== undefined && { color: b.color })
        })),
        loot: payload.loot?.map((l: any) => ({
          id: l.id,
          type: l.type,
          position: { x: Math.round(l.position.x), y: Math.round(l.position.y) },
          ...(l.weaponType && { weaponType: l.weaponType }),
          ...(l.value && { value: l.value })
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
