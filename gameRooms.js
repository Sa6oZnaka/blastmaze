const { generateBombermanMap } = require('./mapGenerator');
const { generateRandomMap } = require('./mapGenerator');

const rooms = {}; // { roomId: { id, players, botsEnabled, grid, bombs, items } }
let roomIdCounter = 0;
let itemIdCounter = 0;

function createRoom({ botsEnabled = true } = {}) {
    const id = "room" + (roomIdCounter++);

    console.log("New room " + id);
    const grid = generateRandomMap(81, 50);
    const room = {
        id,
        players: {},
        bombs: [],
        items: [],
        botsEnabled,
        grid,
        maxPlayers: 10,
        rounds: 1,
        roundTime: 3600,
        allowRespawn: true,
        round: 1,
        requiredToStart: 1,
        started: false,
        joinAfterStart: true
    };
    rooms[id] = room;

    if (botsEnabled) {
        addBotToRoom(room, "bot1", 5, 5);
        addBotToRoom(room, "bot2", 10, 10);
    }

    return room;
}

function createRoom1VS1({ botsEnabled = false } = {}) {
    const id = "room" + (roomIdCounter++);

    console.log("New room COMPETATIVE" + id);
    const grid = generateBombermanMap(21, 13);
    const room = {
        id,
        players: {},
        bombs: [],
        items: [],
        botsEnabled,
        grid,
        maxPlayers: 2,
        rounds: 7,
        roundTime: 3600,
        allowRespawn: false,
        round: 1,
        requiredToStart: 2,
        started: false,
        joinAfterStart: false
    };
    rooms[id] = room;

    return room;
}

function addBombToRoom(room, x, y) {
    room.players[id].bombs.push([x, y]);
}

function addBotToRoom(room, id, x, y) {
    room.players[id] = { id, x, y, bot: true, alive: true, username: id };
}

function findOrCreateRoom(wantBots = true) {
    for (const roomId in rooms) {
        const room = rooms[roomId];

        const playerCount = Object.keys(room.players).length;

        const notFull = playerCount < room.maxPlayers;
        const canJoin = !room.started || room.joinAfterStart; // ако не е стартирала или може да се влиза след старта

        if (
            room.botsEnabled === wantBots &&
            notFull &&
            canJoin
        ) {
            return room;
        }
    }

    // Ако не е намерена - нова
    if (!wantBots)
        return createRoom1VS1(false);

    return createRoom(true);
}

function spawnPlayer1VS1(room, player){
    let grid = room.grid;
    let width = room.grid[0].length;
    let height = room.grid.length;

    // Избираме случайна "четна" клетка
    const posX = Math.floor(Math.random() * (width / 2)) * 2;
    const posY = Math.floor(Math.random() * (height / 2)) * 2;

    player.x = posX;
    player.y = posY;
    const dirs = [
        [0, 0],
        [1, 0], [-1, 0],
        [0, 1], [0, -1],
    ];

    for (const [dx, dy] of dirs) {
        const nx = posX + dx;
        const ny = posY + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            if (grid[ny][nx] !== 2) {
                grid[ny][nx] = 0;
            }
        }
    }

    room.players[player.id] = player;
}

function addPlayerToRoom(room, player) {

    if(!room.wantBots){
        return spawnPlayer1VS1(room, player);
    }

    room.players[player.id] = player;
}

function getRoom(roomId) {
    return rooms[roomId];
}

function removePlayerFromRoom(roomId, playerId) {
    const room = rooms[roomId];
    if (!room) return;
    delete room.players[playerId];

    if (Object.keys(room.players).length === 0) {
        delete rooms[roomId];
    }
}

function spawnItemInRoom(room, x, y, type = "bomb") {
    const id = "item" + (itemIdCounter++);
    const item = { id, x, y, type };
    room.items.push(item);
    return item;
}

function findRoomByPlayer(playerId) {
    for (const roomId in rooms) {
        const room = rooms[roomId];
        if (room.players[playerId]) {
            return room;
        }
    }
    return null;
}

function isCellBlocked(roomId, x, y) {
    let grid = rooms[roomId].grid;
    let BOMB_CLIPPING = true;
    let bombs = rooms[roomId].bombs;

    if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) return true;
    if (grid[y][x] !== 0) return true;
    if (BOMB_CLIPPING && bombs.some(b => b.bombX === x && b.bombY === y)) return true;
    return false;
}

function hasBomb(roomId, bx, by) {
    const room = rooms[roomId];
    if (!room) return false;

    return room.bombs.some(b => b.bombX === bx && b.bombY === by);
}


function collectExplosion(roomId, bx, by, aff = new Set()) {
    let grid = rooms[roomId].grid;
    let bombs = rooms[roomId].bombs;
    let BOMB_RADIUS = 4;
    let DROP_ENABLED = false;

        const idx = bombs.findIndex(b => b.bombX === bx && b.bombY === by);
        if (idx !== -1) { clearTimeout(bombs[idx].timer); bombs.splice(idx, 1); }
        aff.add(`${bx},${by}`);
        grid[by][bx] = 0;
        for (const { dx, dy } of [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }]) {
            for (let s = 1; s <= BOMB_RADIUS; s++) {
                const nx = bx + dx * s, ny = by + dy * s;
                if (ny < 0 || ny >= grid.length || nx < 0 || nx >= grid[0].length) break;
                if (grid[ny][nx] === 1) { 
                    grid[ny][nx] = 0; 
                    aff.add(`${nx},${ny}`); 

                    if(DROP_ENABLED){
                        if (Math.random() < DROP_CHANCE) {
                            //spawnItem(nx, ny);
                        }
                    }
                    
                    break; 
                }
                else if (grid[ny][nx] === 0) aff.add(`${nx},${ny}`);
                else break;
            }
        }
        const chain = bombs.filter(b => aff.has(`${b.bombX},${b.bombY}`));
        chain.forEach(b => { clearTimeout(b.timer); collectExplosion(roomId, b.bombX, b.bombY, aff); });
        return aff;
}

function getAllRooms() {
    return Object.values(rooms);
}

function nextRound(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    //room.round = (room.round || 0) + 1;

    if (! room.botsEnabled) {
        room.grid = generateBombermanMap(21, 13);
    } else {
        room.grid = generateRandomMap(81, 50);
    }

    room.bombs = [];
    room.items = [];

    // new player positions
    for (const id in room.players) {
        


        const player = room.players[id];
        player.alive = true;

        if(room.wantBots){
            player.x = Math.floor(Math.random() * room.grid[0].length);
            player.y = Math.floor(Math.random() * room.grid.length);
        }else{
            spawnPlayer1VS1(room, player);
        }
    }

    // reset bots
    if (room.botsEnabled) {
        const botCount = Object.values(room.players).filter(p => p.bot).length;
        if (botCount < 2) {
            addBotToRoom(room, "bot1", 5, 5);
            addBotToRoom(room, "bot2", 10, 10);
        }
    }

    console.log(`Room ${roomId}: next round started (#${room.round})`);
}

function removeRoom(id) {
    if (rooms[id]) {
        console.log(`Room ${id} removed`);
        delete rooms[id];
        return true;
    }
    return false;
}


module.exports = {
    createRoom,
    findOrCreateRoom,
    addPlayerToRoom,
    getRoom,
    removePlayerFromRoom,
    spawnItemInRoom,
    findRoomByPlayer,
    addBombToRoom,
    isCellBlocked,
    collectExplosion,
    getAllRooms,
    nextRound,
    hasBomb,
    removeRoom
};
