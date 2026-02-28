const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["websocket", "polling"],
});

app.use(express.static("public"));

const rooms = {}; 
const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 mins
const roomTimers = {};

function createEmptyBoard() { return Array(9).fill(null); }

function checkWinner(b) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  for (const [a, b1, c] of lines) {
    if (b[a] && b[a] === b[b1] && b[a] === b[c]) {
      return { symbol: b[a], line: [a, b1, c] };
    }
  }
  return null;
}

function getActivePlayersCount(room) {
    return (room.players.X ? 1 : 0) + (room.players.O ? 1 : 0);
}

function cleanupRoom(roomId) {
  if (roomTimers[roomId]) clearTimeout(roomTimers[roomId]);
  delete rooms[roomId];
  console.log(`Room ${roomId} cleaned up`);
}

function scheduleRoomCleanup(roomId) {
  if (roomTimers[roomId]) clearTimeout(roomTimers[roomId]);
  roomTimers[roomId] = setTimeout(() => cleanupRoom(roomId), INACTIVITY_TIMEOUT);
}

io.on("connection", socket => {
  console.log("User connected:", socket.id);

  socket.on("joinRoom", ({ roomId, password, playerName }) => {
    roomId = String(roomId || "").trim().toLowerCase();
    playerName = String(playerName || "Anonymous").trim().slice(0, 30);
    
    if (!roomId || roomId.length < 3) {
      socket.emit("roomError", "Room code must be at least 3 characters.");
      return;
    }

    if (!rooms[roomId]) {
      rooms[roomId] = {
        password: password || "",
        board: createEmptyBoard(),
        players: { X: null, O: null }, 
        playerNames: {},
        rematchFlags: { X: false, O: false },
        turn: "X",
        moves: 0
      };
      console.log(`Room ${roomId} created`);
    }

    const room = rooms[roomId];
    if (room.password && room.password !== password) {
      socket.emit("roomError", "Incorrect password.");
      return;
    }

    let symbol = null;
    if (room.players.X === socket.id) symbol = "X";
    else if (room.players.O === socket.id) symbol = "O";
    else {
        if (room.players.X === null) { room.players.X = socket.id; symbol = "X"; }
        else if (room.players.O === null) { room.players.O = socket.id; symbol = "O"; }
    }

    room.playerNames[socket.id] = playerName;
    socket.join(roomId);

    const activePlayers = getActivePlayersCount(room);
    socket.emit("init", { symbol, board: room.board, turn: room.turn, playersCount: activePlayers });
    socket.emit("roomJoined", roomId);
    io.to(roomId).emit("playersCount", activePlayers);
    
    io.to(roomId).emit("chatMessage", { senderName: "System", message: `${playerName} has entered`, symbol: null });
    scheduleRoomCleanup(roomId);
  });

  socket.on("chatMessage", ({ roomId, message }) => {
    const room = rooms[roomId];
    if (!room) return;
    const msg = String(message || "").trim();
    if (!msg) return;
    const senderName = room.playerNames?.[socket.id] || "Anonymous";
    const symbol = room.players.X === socket.id ? "X" : room.players.O === socket.id ? "O" : null;
    io.to(roomId).emit("chatMessage", { senderName, message: msg, symbol });
    scheduleRoomCleanup(roomId);
  });

  socket.on("sendReaction", ({ roomId, emoji }) => {
    if (rooms[roomId]) io.to(roomId).emit("playerReaction", { emoji, senderId: socket.id });
  });

  socket.on("requestRematch", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    const symbol = room.players.X === socket.id ? "X" : room.players.O === socket.id ? "O" : null;
    if (symbol) {
        room.rematchFlags[symbol] = true;
        const name = room.playerNames[socket.id];
        
        // Notify chat
        io.to(roomId).emit("chatMessage", { senderName: "System", message: `${name} wants a rematch...`, symbol: null });
        
        // NEW: Notify specific opponent to show popup
        const opponentSymbol = symbol === "X" ? "O" : "X";
        const opponentSocketId = room.players[opponentSymbol];
        if (opponentSocketId) {
             io.to(opponentSocketId).emit("rematchRequestedByOpponent");
        }

        if (room.rematchFlags.X && room.rematchFlags.O) {
            room.board = createEmptyBoard();
            room.turn = "X";
            room.moves = 0;
            room.rematchFlags = { X: false, O: false };
            io.to(roomId).emit("resetBoard");
        }
    }
  });

  socket.on("makeMove", ({ roomId, index, symbol }) => {
    const room = rooms[roomId];
    if (!room || room.players[symbol] !== socket.id || room.turn !== symbol || room.board[index]) {
        return; 
    }

    const existingWinner = checkWinner(room.board);
    if (existingWinner) return;

    room.board[index] = symbol;
    room.moves++;
    room.turn = symbol === "X" ? "O" : "X";

    const winData = checkWinner(room.board);
    const winner = winData ? winData.symbol : null;
    const isDraw = !winner && room.moves === 9;

    io.to(roomId).emit("moveMade", {
      index, symbol, turn: room.turn, winner, winningLine: winData?.line, isDraw
    });

    scheduleRoomCleanup(roomId);
  });

  socket.on("disconnecting", () => {
    for (const rid of socket.rooms) {
      if (rid === socket.id) continue;
      if (!rooms[rid]) continue;
      const room = rooms[rid];
      let wasPlayer = false;
      const leavingName = room.playerNames?.[socket.id] || "Player";

      if (room.players.X === socket.id) { room.players.X = null; wasPlayer = true; }
      if (room.players.O === socket.id) { room.players.O = null; wasPlayer = true; }
      delete room.playerNames[socket.id];

      if (wasPlayer) {
          io.to(rid).emit("opponentLeft");
          room.rematchFlags = { X: false, O: false };
      }

      io.to(rid).emit("chatMessage", { senderName: "System", message: `${leavingName} left`, symbol: null });
      io.to(rid).emit("playersCount", getActivePlayersCount(room));

      if (getActivePlayersCount(room) === 0) cleanupRoom(rid);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🎮 Server running on http://localhost:${PORT}`));