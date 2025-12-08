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

// Store room state using symbol-based player assignment for stability
// roomId -> { password, board, players: { X: socketId, O: socketId }, turn, moves }
const rooms = {};

const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const roomTimers = {};

function createEmptyBoard() {
  return Array(9).fill(null);
}

function checkWinner(b) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  for (const [a, b1, c] of lines) {
    if (b[a] && b[a] === b[b1] && b[a] === b[c]) return b[a];
  }
  return null;
}

/**
 * Calculates the number of active players (X and O) in the room.
 * @param {object} room The room object.
 * @returns {number} The count of active player slots.
 */
function getActivePlayersCount(room) {
    return (room.players.X ? 1 : 0) + (room.players.O ? 1 : 0);
}

function cleanupRoom(roomId) {
  if (roomTimers[roomId]) {
    clearTimeout(roomTimers[roomId]);
    delete roomTimers[roomId];
  }
  delete rooms[roomId];
  console.log(`Room ${roomId} cleaned up`);
}

function scheduleRoomCleanup(roomId) {
  if (roomTimers[roomId]) clearTimeout(roomTimers[roomId]);
  roomTimers[roomId] = setTimeout(() => {
    cleanupRoom(roomId);
  }, INACTIVITY_TIMEOUT);
}

io.on("connection", socket => {
  console.log("User connected:", socket.id);

  socket.on("joinRoom", ({ roomId, password }) => {
    roomId = roomId.trim().toLowerCase();

    if (!roomId || roomId.length < 3) {
      socket.emit("roomError", "Room code must be at least 3 characters.");
      return;
    }

    if (!rooms[roomId]) {
      rooms[roomId] = {
        password: password || "",
        board: createEmptyBoard(),
        // FIX: Use an object to assign symbols persistently
        players: { X: null, O: null }, 
        turn: "X",
        moves: 0
      };
      console.log(`Room ${roomId} created`);
    }

    const room = rooms[roomId];

    // Validate password
    if (room.password && room.password !== password) {
      socket.emit("roomError", "Incorrect password for this room.");
      return;
    }

    let symbol = null;

    // 1. Check if the socket is already one of the players (reconnect)
    if (room.players.X === socket.id) symbol = "X";
    if (room.players.O === socket.id) symbol = "O";

    // 2. If not a current player, assign an open slot
    if (!symbol) {
        if (room.players.X === null) {
            room.players.X = socket.id;
            symbol = "X";
        } else if (room.players.O === null) {
            room.players.O = socket.id;
            symbol = "O";
        }
    }
    
    // If symbol is null, the room is full, and the user is a spectator

    socket.join(roomId);

    const activePlayers = getActivePlayersCount(room);

    socket.emit("init", {
      symbol, // The symbol assigned to the user, or null if spectator
      board: room.board,
      turn: room.turn,
      playersCount: activePlayers
    });

    socket.emit("roomJoined");
    // Broadcast the updated count to everyone in the room
    io.to(roomId).emit("playersCount", activePlayers);

    scheduleRoomCleanup(roomId);

    console.log(`User ${socket.id} joined room ${roomId} as ${symbol || "spectator"}`);
  });

  socket.on("makeMove", ({ roomId, index, symbol }) => {
    const room = rooms[roomId];
    if (!room) {
      // Use the client's socket to notify of the error
      socket.emit("roomError", "Room not found. Please rejoin."); 
      return;
    }
    
    // FIX: Verify the socket making the move is the one assigned to the symbol
    if (room.players[symbol] !== socket.id) {
        socket.emit("roomError", `You are not player ${symbol}. Access denied.`);
        return;
    }

    // Validate turn
    if (room.turn !== symbol) {
      socket.emit("roomError", "It's not your turn.");
      return;
    }

    if (room.board[index]) {
      socket.emit("roomError", "That cell is already taken.");
      return;
    }

    if (index < 0 || index > 8) {
      socket.emit("roomError", "Invalid cell index.");
      return;
    }

    room.board[index] = symbol;
    room.moves++;
    room.turn = symbol === "X" ? "O" : "X";

    const winner = checkWinner(room.board);
    const isDraw = !winner && room.moves === 9;

    io.to(roomId).emit("moveMade", {
      index,
      symbol,
      turn: room.turn,
      winner,
      isDraw
    });

    if (winner || isDraw) {
      // Delay the server state reset slightly after sending the winning move
      // to allow the client to process the win/draw state for 2 seconds.
      setTimeout(() => {
        room.board = createEmptyBoard();
        room.turn = "X";
        room.moves = 0;
        io.to(roomId).emit("resetBoard");
      }, 2000); // 2-second pause before game reset
    }

    scheduleRoomCleanup(roomId);
  });

  socket.on("disconnecting", () => {
    for (const roomId of socket.rooms) {
      if (rooms[roomId]) {
        const room = rooms[roomId];
        let wasPlayer = false;

        // FIX: Remove the disconnected socket ID from the player object slots
        if (room.players.X === socket.id) {
            room.players.X = null;
            wasPlayer = true;
        }
        if (room.players.O === socket.id) {
            room.players.O = null;
            wasPlayer = true;
        }

        const activePlayers = getActivePlayersCount(room);
        
        // Only broadcast the updated count if a player slot was vacated
        if (wasPlayer) {
            io.to(roomId).emit("playersCount", activePlayers);
        }

        if (activePlayers === 0) {
          // No one left, clean up the room
          cleanupRoom(roomId);
        } else {
          // Keep the room alive for remaining player(s)/spectators
          scheduleRoomCleanup(roomId);
        }
      }
    }
    console.log("User disconnecting:", socket.id);
  });

  socket.on("disconnect", () => {
    console.log("User fully disconnected:", socket.id);
  });

  socket.on("error", (error) => {
    console.error("Socket error:", error);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 Server running on http://localhost:${PORT}`);
});