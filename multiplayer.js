/**
 * Accessible Ludo Multiplayer Module
 *
 * Implements serverless online multiplayer using:
 * 1. WebRTC DataChannels via PeerJS (window.Peer) for cross-device peer-to-peer play over the internet.
 * 2. HTML5 BroadcastChannel ('ludo-room-' + roomId) in parallel for instantaneous sub-millisecond
 *    communication across tabs in the same browser, even when offline or behind restrictive firewalls.
 *
 * Exported as:
 * - window.LudoMultiplayer (in browser)
 * - module.exports (in Node.js)
 */

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LudoMultiplayer = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Constants
  const PLAYER_COLORS = ['Red', 'Green', 'Yellow', 'Blue'];
  const MAX_PLAYERS = 4;
  const SEED_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789'; // Unambiguous alphanumeric characters

  // Module state
  let isInMultiplayer = false;
  let isHostMode = false;
  let roomId = null;
  let localPlayerIndex = null; // 0=Red, 1=Green, 2=Yellow, 3=Blue
  let localPlayerName = '';
  let localPeerId = null;
  let connectionStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'error'
  let cachedState = null;
  let pendingJoinResolve = null;

  // Active connected players: [{ peerId, name, playerIndex, color, isHost, connected }]
  let connectedPlayers = [];

  // Communication instances
  let broadcastChannel = null;
  let peerInstance = null;
  const peerConnections = new Map(); // peerId -> DataConnection

  // Message deduplication cache
  const seenMessageIds = new Set();
  const MAX_SEEN_CACHE = 400;
  let msgSeq = 0;

  // Registered callbacks
  let callbacks = {
    onStateSync: null,
    onRemoteAction: null,
    onRemoteRoll: null,
    onRemoteMove: null,
    onLobbyUpdate: null,
    onConnectionStatus: null,
    onAnnouncement: null
  };

  /**
   * Generates a clean, unique 6-character room identifier: "ludo-" + 6 chars
   */
  function generateRoomId() {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += SEED_CHARS.charAt(Math.floor(Math.random() * SEED_CHARS.length));
    }
    return 'ludo-' + code;
  }

  /**
   * Extracts clean room ID from raw input (supports plain ID, query string, or full URL)
   * e.g. "ludo-a1b2c3", "?room=ludo-a1b2c3", or "https://.../?room=ludo-a1b2c3"
   */
  function extractRoomId(input) {
    if (!input || typeof input !== 'string') return '';
    let str = input.trim();
    if (str.includes('?room=') || str.includes('&room=')) {
      try {
        const match = str.match(/[?&]room=([^&#]+)/);
        if (match && match[1]) {
          return decodeURIComponent(match[1]).trim().toLowerCase();
        }
      } catch (e) {}
    }
    return str.trim().toLowerCase();
  }

  /**
   * Reads ?room= from window.location.search
   * Returns trimmed room ID string or null.
   */
  function getRoomFromUrl() {
    if (typeof window === 'undefined' || !window.location) {
      return null;
    }
    try {
      if (window.location.search) {
        const params = new URLSearchParams(window.location.search);
        const room = params.get('room');
        if (room && room.trim()) {
          return extractRoomId(room);
        }
      }
    } catch (e) {}
    return null;
  }

  /**
   * Constructs full shareable invite URL for the current room
   */
  function getInviteUrl() {
    if (!roomId) {
      if (typeof window !== 'undefined' && window.location) {
        return window.location.href.split('?')[0];
      }
      return '';
    }
    if (typeof window !== 'undefined' && window.location) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('room', roomId);
        return url.toString();
      } catch (e) {
        const origin = window.location.origin || '';
        const pathname = window.location.pathname || '';
        return origin + pathname + '?room=' + encodeURIComponent(roomId);
      }
    }
    return 'https://darkalireza.github.io/accessible-ludo/?room=' + encodeURIComponent(roomId);
  }

  /**
   * Updates browser address bar with ?room=<roomId> via window.history.replaceState
   * without triggering a page reload.
   */
  function updateUrlWithRoom(id) {
    if (typeof window === 'undefined' || !window.location || !window.history || !window.history.replaceState) {
      return;
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('room', id);
      window.history.replaceState({}, '', url.toString());
    } catch (e) {
      try {
        const cleanPath = window.location.pathname || '/';
        window.history.replaceState({}, '', cleanPath + '?room=' + encodeURIComponent(id));
      } catch (err) {}
    }
  }

  /**
   * Removes ?room= from browser address bar via window.history.replaceState
   */
  function clearRoomFromUrl() {
    if (typeof window === 'undefined' || !window.location || !window.history || !window.history.replaceState) {
      return;
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('room');
      const target = url.search ? url.toString() : (url.origin + url.pathname);
      window.history.replaceState({}, '', target);
    } catch (e) {
      try {
        const cleanPath = window.location.pathname || '/';
        window.history.replaceState({}, '', cleanPath);
      } catch (err) {}
    }
  }

  /**
   * Copies the room invite link to clipboard.
   * Uses navigator.clipboard.writeText with fallback to a hidden <textarea>.
   * Returns Promise resolving to { success: boolean, url: string }.
   */
  function copyInviteLink() {
    const url = getInviteUrl();
    if (!url) {
      return Promise.reject(new Error('No active room to copy invite link for.'));
    }

    return new Promise(function (resolve) {
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(url)
          .then(function () {
            resolve({ success: true, url: url });
          })
          .catch(function () {
            const ok = fallbackCopyText(url);
            resolve({ success: ok, url: url });
          });
        return;
      }

      const ok = fallbackCopyText(url);
      resolve({ success: ok, url: url });
    });
  }

  function fallbackCopyText(text) {
    if (typeof document === 'undefined') return false;
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '-9999px';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      return Boolean(successful);
    } catch (err) {
      return false;
    }
  }

  /**
   * Message deduplication check across BroadcastChannel and WebRTC
   */
  function hasSeenMessage(msgId) {
    if (!msgId) return false;
    if (seenMessageIds.has(msgId)) return true;
    seenMessageIds.add(msgId);
    if (seenMessageIds.size > MAX_SEEN_CACHE) {
      const iter = seenMessageIds.values();
      for (let i = 0; i < 60; i++) {
        const next = iter.next();
        if (!next.done) seenMessageIds.delete(next.value);
      }
    }
    return false;
  }

  /**
   * Creates an envelope for a multiplayer message with unique ID and sender metadata
   */
  function createMessage(type, payload) {
    msgSeq = (msgSeq + 1) % 1000000;
    const msgId = (localPeerId || 'peer') + '_' + Date.now() + '_' + msgSeq;
    return Object.assign({
      msgId: msgId,
      type: type,
      senderId: localPeerId,
      roomId: roomId,
      timestamp: Date.now()
    }, payload || {});
  }

  /**
   * Dispatches data over BroadcastChannel (if active)
   */
  function sendViaBroadcast(data) {
    if (!broadcastChannel) return;
    try {
      broadcastChannel.postMessage(data);
    } catch (err) {
      // In case of channel close or serialization issue
    }
  }

  /**
   * Broadcasts a message to all connected peers via both BroadcastChannel and WebRTC
   */
  function broadcastMessage(payload) {
    const msg = createMessage(payload.type, payload);
    hasSeenMessage(msg.msgId); // Mark local message as seen

    // 1. Send via local BroadcastChannel
    sendViaBroadcast(msg);

    // 2. Send via WebRTC DataConnections
    peerConnections.forEach(function (conn) {
      if (conn && conn.open) {
        try {
          conn.send(msg);
        } catch (e) {}
      }
    });
  }

  /**
   * Sends a message to the Host
   */
  function sendToHost(payload) {
    const msg = createMessage(payload.type, payload);
    hasSeenMessage(msg.msgId); // Mark local message as seen

    // 1. Send via BroadcastChannel (reaches host if on same machine/browser)
    sendViaBroadcast(msg);

    // 2. Send via WebRTC DataConnection
    if (roomId && peerConnections.has(roomId)) {
      const conn = peerConnections.get(roomId);
      if (conn && conn.open) {
        try {
          conn.send(msg);
        } catch (e) {}
      }
    } else {
      // If not keyed by roomId, send over any open peer connection
      peerConnections.forEach(function (conn) {
        if (conn && conn.open) {
          try {
            conn.send(msg);
          } catch (e) {}
        }
      });
    }
  }

  /**
   * Handles all incoming messages from BroadcastChannel and PeerJS
   */
  function handleIncomingMessage(raw, source) {
    let msg = raw;
    if (typeof raw === 'string') {
      try {
        msg = JSON.parse(raw);
      } catch (e) {
        return;
      }
    }

    if (!msg || typeof msg !== 'object') return;

    // Discard messages for a different room
    if (roomId && msg.roomId && msg.roomId !== roomId) return;

    // Discard echo of our own message
    if (msg.senderId && msg.senderId === localPeerId) return;

    // Discard duplicates already processed via parallel channel
    if (msg.msgId && hasSeenMessage(msg.msgId)) {
      return;
    }

    switch (msg.type) {
      case 'JOIN_REQUEST':
        handleJoinRequest(msg);
        break;

      case 'WELCOME_SYNC':
        handleWelcomeSync(msg);
        break;

      case 'LOBBY_UPDATE':
        handleLobbyUpdate(msg);
        break;

      case 'STATE_SYNC':
        handleStateSync(msg);
        break;

      case 'REMOTE_ACTION':
      case 'REMOTE_ROLL':
      case 'REMOTE_MOVE':
      case 'ROLL':
      case 'MOVE':
        handleRemoteAction(msg);
        break;

      case 'PLAYER_LEAVE':
        handlePlayerLeave(msg);
        break;

      case 'ROOM_CLOSED':
        handleRoomClosed(msg);
        break;

      case 'ROOM_FULL':
        if (!msg.targetPeerId || msg.targetPeerId === localPeerId) {
          connectionStatus = 'error';
          if (callbacks.onConnectionStatus) {
            callbacks.onConnectionStatus('error', { message: msg.message || 'Room is full' });
          }
          if (callbacks.onAnnouncement) {
            callbacks.onAnnouncement(msg.message || 'Multiplayer room is full (4 players maximum).');
          }
        }
        break;

      case 'PING':
        if (msg.senderId) {
          const pong = createMessage('PONG', { targetPeerId: msg.senderId });
          sendViaBroadcast(pong);
          if (peerConnections.has(msg.senderId)) {
            try { peerConnections.get(msg.senderId).send(pong); } catch (e) {}
          }
        }
        break;

      case 'PONG':
        break;

      default:
        break;
    }
  }

  /**
   * Host processes a JOIN_REQUEST from a guest
   */
  function handleJoinRequest(msg) {
    if (!isHostMode || !isInMultiplayer) return;
    if (msg.roomId && msg.roomId !== roomId) return;

    const senderId = msg.senderId;
    const guestName = (msg.name && typeof msg.name === 'string' && msg.name.trim())
      ? msg.name.trim()
      : 'Guest';

    // Check if player is already registered (reconnect scenario)
    let player = connectedPlayers.find(function (p) {
      return p.peerId === senderId;
    });

    let assignedSeat = null;

    if (player) {
      player.connected = true;
      player.name = guestName;
      assignedSeat = player.playerIndex;
    } else {
      // Find the first unoccupied seat among 1 (Green), 2 (Yellow), 3 (Blue)
      const occupiedSeats = new Set(
        connectedPlayers.filter(function (p) { return p.connected; }).map(function (p) { return p.playerIndex; })
      );

      for (let s = 1; s < MAX_PLAYERS; s++) {
        if (!occupiedSeats.has(s)) {
          assignedSeat = s;
          break;
        }
      }

      if (assignedSeat === null) {
        // Room has all 4 seats occupied
        const fullMsg = createMessage('ROOM_FULL', {
          targetPeerId: senderId,
          message: 'Room is full (maximum 4 players).'
        });
        sendViaBroadcast(fullMsg);
        if (peerConnections.has(senderId)) {
          try { peerConnections.get(senderId).send(fullMsg); } catch (e) {}
        }
        return;
      }

      player = {
        peerId: senderId,
        name: guestName || ('Player ' + (assignedSeat + 1) + ' (' + PLAYER_COLORS[assignedSeat] + ')'),
        playerIndex: assignedSeat,
        color: PLAYER_COLORS[assignedSeat],
        isHost: false,
        connected: true
      };
      connectedPlayers.push(player);
    }

    const welcomePayload = {
      targetPeerId: senderId,
      playerIndex: assignedSeat,
      color: PLAYER_COLORS[assignedSeat],
      playersList: connectedPlayers.slice(),
      state: cachedState,
      message: player.name + ' joined as ' + player.color + '!'
    };

    // Send WELCOME_SYNC specifically to the joining guest
    const welcomeMsg = createMessage('WELCOME_SYNC', welcomePayload);
    sendViaBroadcast(welcomeMsg);
    if (peerConnections.has(senderId)) {
      try { peerConnections.get(senderId).send(welcomeMsg); } catch (e) {}
    }

    // Broadcast updated lobby to all connected peers
    broadcastMessage({
      type: 'LOBBY_UPDATE',
      playersList: connectedPlayers.slice(),
      message: player.name + ' joined as ' + player.color + '.'
    });

    if (callbacks.onLobbyUpdate) {
      callbacks.onLobbyUpdate(connectedPlayers.slice());
    }

    if (callbacks.onAnnouncement) {
      callbacks.onAnnouncement(player.name + ' joined the room as ' + player.color + '.');
    }
  }

  /**
   * Guest processes a WELCOME_SYNC from the host
   */
  function handleWelcomeSync(msg) {
    if (msg.targetPeerId && msg.targetPeerId !== localPeerId) {
      return;
    }

    localPlayerIndex = typeof msg.playerIndex === 'number' ? msg.playerIndex : 1;
    connectedPlayers = Array.isArray(msg.playersList) ? msg.playersList : [];
    connectionStatus = 'connected';

    if (pendingJoinResolve) {
      pendingJoinResolve({
        roomId: roomId,
        playerIndex: localPlayerIndex,
        color: PLAYER_COLORS[localPlayerIndex]
      });
      pendingJoinResolve = null;
    }

    if (callbacks.onConnectionStatus) {
      callbacks.onConnectionStatus('connected', {
        roomId: roomId,
        playerIndex: localPlayerIndex,
        color: PLAYER_COLORS[localPlayerIndex],
        isHost: false
      });
    }

    if (callbacks.onLobbyUpdate) {
      callbacks.onLobbyUpdate(connectedPlayers.slice());
    }

    if (msg.state && callbacks.onStateSync) {
      callbacks.onStateSync(msg.state, msg);
    }

    const welcomeMsg = msg.message || ('Joined room as ' + PLAYER_COLORS[localPlayerIndex] + '. Game synchronized.');
    if (callbacks.onAnnouncement) {
      callbacks.onAnnouncement(welcomeMsg);
    }
  }

  /**
   * Updates local lobby player list
   */
  function handleLobbyUpdate(msg) {
    if (Array.isArray(msg.playersList)) {
      connectedPlayers = msg.playersList;
      if (callbacks.onLobbyUpdate) {
        callbacks.onLobbyUpdate(connectedPlayers.slice());
      }
    }
    if (msg.message && callbacks.onAnnouncement) {
      callbacks.onAnnouncement(msg.message);
    }
  }

  /**
   * Guest updates game state when host broadcasts STATE_SYNC
   */
  function handleStateSync(msg) {
    if (isHostMode) return; // Host is source of truth; ignore external state syncs

    cachedState = msg.state;
    if (Array.isArray(msg.playersList)) {
      connectedPlayers = msg.playersList;
      if (callbacks.onLobbyUpdate) {
        callbacks.onLobbyUpdate(connectedPlayers.slice());
      }
    }

    if (callbacks.onStateSync) {
      callbacks.onStateSync(msg.state, msg);
    }

    if (msg.message && callbacks.onAnnouncement) {
      callbacks.onAnnouncement(msg.message);
    }
  }

  /**
   * Host processes action sent by a remote guest
   */
  function handleRemoteAction(msg) {
    if (!isHostMode) return;

    const action = msg.action || msg;

    // Enforce sender playerIndex integrity
    let senderIndex = typeof action.playerIndex === 'number' ? action.playerIndex : null;
    const player = connectedPlayers.find(function (p) {
      return p.peerId === msg.senderId;
    });

    if (player && (senderIndex === null || senderIndex !== player.playerIndex)) {
      senderIndex = player.playerIndex;
      action.playerIndex = senderIndex;
    }

    if (callbacks.onRemoteAction) {
      callbacks.onRemoteAction(action);
    }

    const actType = (action.type || '').toUpperCase();
    if (actType === 'REMOTE_ROLL' || actType === 'ROLL') {
      if (callbacks.onRemoteRoll) callbacks.onRemoteRoll(action);
    } else if (actType === 'REMOTE_MOVE' || actType === 'MOVE') {
      if (callbacks.onRemoteMove) callbacks.onRemoteMove(action);
    }
  }

  /**
   * Handles player leave / disconnection
   */
  function handlePlayerLeave(msg) {
    const senderId = msg.senderId;
    const p = connectedPlayers.find(function (x) {
      return x.peerId === senderId || (typeof msg.playerIndex === 'number' && x.playerIndex === msg.playerIndex);
    });

    if (p) {
      p.connected = false;
      const leaveText = p.name + ' disconnected.';

      if (callbacks.onLobbyUpdate) {
        callbacks.onLobbyUpdate(connectedPlayers.slice());
      }

      if (callbacks.onAnnouncement) {
        callbacks.onAnnouncement(leaveText);
      }

      if (isHostMode) {
        broadcastMessage({
          type: 'LOBBY_UPDATE',
          playersList: connectedPlayers.slice(),
          message: leaveText
        });
      }
    }
  }

  /**
   * Handles host ending or leaving the room
   */
  function handleRoomClosed(msg) {
    if (isHostMode) return;
    const closeMsg = msg.message || 'Host has ended the multiplayer session.';

    if (callbacks.onConnectionStatus) {
      callbacks.onConnectionStatus('disconnected', { message: closeMsg });
    }

    if (callbacks.onAnnouncement) {
      callbacks.onAnnouncement(closeMsg);
    }

    leaveRoom();
  }

  /**
   * Initializes the BroadcastChannel for instantaneous multi-tab communication
   */
  function initBroadcastChannel() {
    if (typeof BroadcastChannel === 'undefined' || !roomId) {
      return;
    }
    try {
      if (broadcastChannel) {
        try { broadcastChannel.close(); } catch (e) {}
      }
      broadcastChannel = new BroadcastChannel('ludo-room-' + roomId);
      broadcastChannel.onmessage = function (event) {
        handleIncomingMessage(event.data, 'broadcast');
      };
    } catch (e) {
      broadcastChannel = null;
    }
  }

  /**
   * Initializes WebRTC PeerJS connection via window.Peer
   */
  function initPeerJS(asHost) {
    if (typeof window === 'undefined' || !window.Peer) {
      return;
    }

    try {
      if (peerInstance && !peerInstance.destroyed) {
        try { peerInstance.destroy(); } catch (e) {}
      }

      const peerOptions = {
        debug: 0,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      };

      if (asHost) {
        peerInstance = new window.Peer(roomId, peerOptions);
      } else {
        peerInstance = new window.Peer(undefined, peerOptions);
      }

      peerInstance.on('open', function (id) {
        if (!asHost) {
          localPeerId = id;
          connectToPeerHost(roomId);
        }
      });

      peerInstance.on('connection', function (conn) {
        setupDataConnection(conn);
      });

      peerInstance.on('error', function (err) {
        // Handle error gracefully so BroadcastChannel remains operational
        if (err && err.type === 'unavailable-id') {
          // If room ID conflict on PeerJS broker, BroadcastChannel still functions
          if (callbacks.onAnnouncement) {
            callbacks.onAnnouncement('Notice: PeerJS room ID in use. BroadcastChannel mode active.');
          }
        }
      });
    } catch (err) {
      peerInstance = null;
    }
  }

  /**
   * Connects guest to host via PeerJS
   */
  function connectToPeerHost(hostRoomId) {
    if (!peerInstance || peerInstance.destroyed) return;
    try {
      const conn = peerInstance.connect(hostRoomId, { reliable: true });
      setupDataConnection(conn);
    } catch (e) {}
  }

  /**
   * Configures listeners on a PeerJS DataConnection
   */
  function setupDataConnection(conn) {
    if (!conn) return;
    peerConnections.set(conn.peer, conn);

    conn.on('open', function () {
      if (!isHostMode) {
        // Send initial JOIN_REQUEST over WebRTC DataConnection
        conn.send(createMessage('JOIN_REQUEST', {
          name: localPlayerName,
          senderId: localPeerId,
          roomId: roomId
        }));
      }
    });

    conn.on('data', function (data) {
      handleIncomingMessage(data, 'peerjs');
    });

    conn.on('close', function () {
      peerConnections.delete(conn.peer);
      handlePlayerLeave({ senderId: conn.peer });
    });

    conn.on('error', function () {
      peerConnections.delete(conn.peer);
    });
  }

  // Handle window unload to gracefully notify room members
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('beforeunload', function () {
      if (isInMultiplayer) {
        if (isHostMode) {
          sendViaBroadcast(createMessage('ROOM_CLOSED', {
            message: 'Host has left the room.'
          }));
        } else {
          sendToHost({
            type: 'PLAYER_LEAVE',
            senderId: localPeerId,
            playerIndex: localPlayerIndex,
            name: localPlayerName
          });
        }
      }
    });
  }

  // --- Public API ---

  /**
   * Registers multiplayer event callbacks
   * @param {Object} cbs
   * @param {Function} [cbs.onStateSync]
   * @param {Function} [cbs.onRemoteAction]
   * @param {Function} [cbs.onRemoteRoll]
   * @param {Function} [cbs.onRemoteMove]
   * @param {Function} [cbs.onLobbyUpdate]
   * @param {Function} [cbs.onConnectionStatus]
   * @param {Function} [cbs.onAnnouncement]
   */
  function init(cbs) {
    if (cbs && typeof cbs === 'object') {
      callbacks = Object.assign(callbacks, cbs);
    }
    return true;
  }

  /**
   * Hosts a new multiplayer room.
   * Generates room ID, updates URL with ?room=<roomId>, assigns Host as Red (Seat 0),
   * opens BroadcastChannel and PeerJS, and announces room creation.
   *
   * @param {string} [hostName]
   * @param {Object} [initialState] Optional initial game state to cache
   * @returns {{ roomId: string, inviteUrl: string, localPlayerIndex: number }}
   */
  function hostRoom(hostName, initialState) {
    if (isInMultiplayer) {
      leaveRoom();
    }

    isHostMode = true;
    isInMultiplayer = true;
    roomId = generateRoomId();
    localPeerId = roomId;
    localPlayerIndex = 0; // Host is always Seat 0 (Red)
    localPlayerName = (hostName && typeof hostName === 'string' && hostName.trim())
      ? hostName.trim()
      : 'Host (Red)';
    connectionStatus = 'connected';
    cachedState = initialState || null;

    updateUrlWithRoom(roomId);

    connectedPlayers = [
      {
        peerId: localPeerId,
        name: localPlayerName,
        playerIndex: 0,
        color: PLAYER_COLORS[0],
        isHost: true,
        connected: true
      }
    ];

    initBroadcastChannel();
    initPeerJS(true);

    if (callbacks.onConnectionStatus) {
      callbacks.onConnectionStatus('connected', {
        roomId: roomId,
        playerIndex: 0,
        color: PLAYER_COLORS[0],
        isHost: true
      });
    }

    if (callbacks.onLobbyUpdate) {
      callbacks.onLobbyUpdate(connectedPlayers.slice());
    }

    if (callbacks.onAnnouncement) {
      callbacks.onAnnouncement(
        'Hosting multiplayer room ' + roomId + '. You are Red. Share the invite link with players!'
      );
    }

    return {
      roomId: roomId,
      inviteUrl: getInviteUrl(),
      localPlayerIndex: 0
    };
  }

  /**
   * Joins an existing multiplayer room.
   * Updates URL with ?room=<roomId>, opens BroadcastChannel and PeerJS,
   * sends JOIN_REQUEST, and waits for WELCOME_SYNC.
   *
   * @param {string} targetRoomId
   * @param {string} [guestName]
   * @returns {Promise<{ roomId: string, playerIndex: number, color: string }>}
   */
  function joinRoom(targetRoomId, guestName) {
    const cleanId = extractRoomId(targetRoomId);
    if (!cleanId) {
      return Promise.reject(new Error('Invalid room ID provided.'));
    }

    if (isInMultiplayer) {
      leaveRoom();
    }

    isHostMode = false;
    isInMultiplayer = true;
    roomId = cleanId;
    localPlayerIndex = null; // Awaiting host assignment (1..3)
    localPlayerName = (guestName && typeof guestName === 'string' && guestName.trim())
      ? guestName.trim()
      : 'Guest';
    connectionStatus = 'connecting';
    localPeerId = 'guest_' + Math.random().toString(36).substring(2, 9);

    updateUrlWithRoom(roomId);
    connectedPlayers = [];

    if (callbacks.onConnectionStatus) {
      callbacks.onConnectionStatus('connecting', {
        roomId: roomId
      });
    }

    if (callbacks.onAnnouncement) {
      callbacks.onAnnouncement('Connecting to room ' + roomId + '...');
    }

    // Open BroadcastChannel immediately for zero-latency local tab communication
    initBroadcastChannel();

    const sendJoin = function () {
      if (!isInMultiplayer || connectionStatus === 'connected') return;
      sendViaBroadcast(createMessage('JOIN_REQUEST', {
        name: localPlayerName,
        senderId: localPeerId,
        roomId: roomId
      }));
    };

    sendJoin();

    // Retry sending JOIN_REQUEST over BroadcastChannel in case host was busy initializing
    let joinRetries = 0;
    const joinInterval = setInterval(function () {
      joinRetries++;
      if (!isInMultiplayer || connectionStatus === 'connected' || joinRetries >= 5) {
        clearInterval(joinInterval);
        return;
      }
      sendJoin();
    }, 450);

    // Initialize PeerJS for cross-network play
    initPeerJS(false);

    return new Promise(function (resolve) {
      const timeoutId = setTimeout(function () {
        if (connectionStatus === 'connected') {
          resolve({
            roomId: roomId,
            playerIndex: localPlayerIndex,
            color: PLAYER_COLORS[localPlayerIndex]
          });
        } else {
          resolve({
            roomId: roomId,
            status: connectionStatus,
            playerIndex: localPlayerIndex
          });
        }
      }, 3000);

      pendingJoinResolve = function (result) {
        clearTimeout(timeoutId);
        clearInterval(joinInterval);
        resolve(result);
      };
    });
  }

  /**
   * Sends a gameplay action (roll or move).
   * If called by guest, sends to host. If called by host, invokes handlers directly.
   *
   * @param {Object} action - e.g. { type: 'REMOTE_ROLL', playerIndex } or { type: 'REMOTE_MOVE', playerIndex, tokenIndex }
   * @returns {boolean}
   */
  function sendAction(action) {
    if (!isInMultiplayer || !action) return false;

    const actionObj = Object.assign({}, action, {
      senderId: localPeerId,
      playerIndex: localPlayerIndex !== null ? localPlayerIndex : action.playerIndex
    });

    if (isHostMode) {
      if (callbacks.onRemoteAction) {
        callbacks.onRemoteAction(actionObj);
      }
      const actType = (actionObj.type || '').toUpperCase();
      if (actType === 'REMOTE_ROLL' || actType === 'ROLL') {
        if (callbacks.onRemoteRoll) callbacks.onRemoteRoll(actionObj);
      } else if (actType === 'REMOTE_MOVE' || actType === 'MOVE') {
        if (callbacks.onRemoteMove) callbacks.onRemoteMove(actionObj);
      }
      return true;
    }

    sendToHost({
      type: actionObj.type || 'REMOTE_ACTION',
      action: actionObj,
      playerIndex: actionObj.playerIndex,
      tokenIndex: actionObj.tokenIndex
    });
    return true;
  }

  /**
   * Host broadcasts updated state, lastEvent, moveResult, or announcement to all peers.
   *
   * @param {Object} payload - { state, lastEvent, roll, moveResult, movingPlayer, message, playersList }
   * @returns {boolean}
   */
  function broadcastState(payload) {
    if (!isInMultiplayer || !isHostMode) return false;

    cachedState = (payload && payload.state) ? payload.state : payload;

    const syncMsg = {
      type: 'STATE_SYNC',
      state: cachedState,
      lastEvent: payload ? payload.lastEvent : null,
      roll: (payload && payload.roll !== undefined) ? payload.roll : null,
      moveResult: payload ? payload.moveResult : null,
      movingPlayer: (payload && payload.movingPlayer !== undefined) ? payload.movingPlayer : null,
      message: payload ? payload.message : null,
      playersList: connectedPlayers.slice()
    };

    broadcastMessage(syncMsg);
    return true;
  }

  /**
   * Leaves current room and closes all connections
   */
  function leaveRoom() {
    if (isInMultiplayer) {
      if (isHostMode) {
        try {
          broadcastMessage({
            type: 'ROOM_CLOSED',
            message: 'Host has closed the multiplayer room.'
          });
        } catch (e) {}
      } else {
        try {
          sendToHost({
            type: 'PLAYER_LEAVE',
            senderId: localPeerId,
            playerIndex: localPlayerIndex,
            name: localPlayerName
          });
        } catch (e) {}
      }
    }

    if (broadcastChannel) {
      try {
        broadcastChannel.close();
      } catch (e) {}
      broadcastChannel = null;
    }

    peerConnections.forEach(function (conn) {
      try {
        conn.close();
      } catch (e) {}
    });
    peerConnections.clear();

    if (peerInstance) {
      try {
        peerInstance.destroy();
      } catch (e) {}
      peerInstance = null;
    }

    clearRoomFromUrl();

    isInMultiplayer = false;
    isHostMode = false;
    roomId = null;
    localPlayerIndex = null;
    localPeerId = null;
    connectedPlayers = [];
    connectionStatus = 'disconnected';
    cachedState = null;
    pendingJoinResolve = null;

    if (callbacks.onConnectionStatus) {
      callbacks.onConnectionStatus('disconnected');
    }

    if (callbacks.onLobbyUpdate) {
      callbacks.onLobbyUpdate([]);
    }

    return true;
  }

  /**
   * Caches latest state for instant sync when new guests join
   */
  function setCachedState(state) {
    cachedState = state;
  }

  // State Getters
  function isMultiplayer() {
    return Boolean(isInMultiplayer);
  }

  function isHost() {
    return Boolean(isHostMode);
  }

  function getLocalPlayerIndex() {
    return localPlayerIndex;
  }

  function getLocalPlayerColor() {
    return localPlayerIndex !== null ? PLAYER_COLORS[localPlayerIndex] : null;
  }

  function getRoomId() {
    return roomId;
  }

  function getConnectedPlayers() {
    return connectedPlayers.map(function (p) {
      return Object.assign({}, p);
    });
  }

  function getStatus() {
    return connectionStatus;
  }

  return {
    init: init,
    hostRoom: hostRoom,
    joinRoom: joinRoom,
    leaveRoom: leaveRoom,
    sendAction: sendAction,
    broadcastState: broadcastState,
    getRoomFromUrl: getRoomFromUrl,
    getInviteUrl: getInviteUrl,
    copyInviteLink: copyInviteLink,
    extractRoomId: extractRoomId,
    setCachedState: setCachedState,
    isMultiplayer: isMultiplayer,
    isHost: isHost,
    getLocalPlayerIndex: getLocalPlayerIndex,
    getLocalPlayerColor: getLocalPlayerColor,
    getRoomId: getRoomId,
    getConnectedPlayers: getConnectedPlayers,
    getStatus: getStatus,
    PLAYER_COLORS: PLAYER_COLORS
  };
});
