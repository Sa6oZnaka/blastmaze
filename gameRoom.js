//const { Server } = require('socket.io');


module.exports = function (io){

//function createServer({ botsEnabled = true } = {}) {


    //const io = new Server(server);
    const grid = generateRandomMap(81, 50);
    const players = {};
    const bombs = []; // { bombX, bombY, timer, explodeAt }

    const items = []; // { id, x, y, type }
    let itemIdCounter = 0;


    // SETTINGS //
    let BOT_ENABLED = true;
    let PEACEFUL_BOTS = true;
    let DROP_ENABLED = true;
    let DROP_CHANCE = 0.02;
    let BOMB_CLIPPING = true;
    let BOMB_RADIUS = 3;

    function generateRandomMap(rows = 81, cols = 50) {
        const grid = [];
        for (let y = 0; y < rows; y++) {
            const row = [];
            for (let x = 0; x < cols; x++) {
                if ((y === 0 && x === 0) || (y === 0 && x === 1) || (y === 1 && x === 0)) {
                    row.push(0);
                } else {
                    const r = Math.random();
                    if (r < 0.05) row.push(2); // indestructible
                    else if (r < 0.2) row.push(1); // destructible
                    else row.push(0); // empty
                }
            }
            grid.push(row);
        }
        return grid;
    }

    io.use((socket, next) => {
        const sess = socket.handshake.session;

        if (!sess || !sess.user) {
            console.log('❌ Blocked socket with no session');
            return next(new Error('Unauthorized'));
        }

        console.log('✅ Socket session:', sess.user.username);
        next();
    });

    io.on('connection', (socket) => {
        console.log(`New connection: ${socket.id}`);
        const sess = socket.handshake.session;

        const mapData = { grid, width: grid[0].length, height: grid.length };
        players[socket.id] = { 
            id: socket.id, 
            x: 0, 
            y: 0, 
            bot: false,
            username: sess.user.username,
            alive: true 
        };

        socket.emit('mapData', mapData);
        socket.emit('currentPlayers', players);
        socket.broadcast.emit('playerJoined', players[socket.id]);

        socket.on('move', ({ dx, dy }) => {
            const player = players[socket.id];
            if (!player) return;
            
            if(isCellBlocked(player.x + dx, player.y + dy)){
                socket.emit("revertMove", ({x: player.x, y: player.y}));
                return;
            }

            player.x += dx;
            player.y += dy;

            io.emit('playerMoved', { id: socket.id, x: player.x, y: player.y });
        });

        socket.on('respawn', () => {

            players[socket.id].y = Math.floor(Math.random() * grid[0].length);
            players[socket.id].y = Math.floor(Math.random() * grid.length);

            players[socket.id].alive = true;

            io.emit('playerRespawned', players[socket.id]);
        });

        socket.on('placeBomb', () => placeBomb(socket.id));

        socket.on('pickupItem', ({ itemId }) => {
            const player = players[socket.id];
            if (!player) return;

            const idx = items.findIndex(it => it.id === itemId);
            if (idx === -1) return;

            const item = items[idx];
            if (player.x === item.x && player.y === item.y) {
                items.splice(idx, 1);
                io.emit('itemPicked', { playerId: socket.id, itemId: item.id, type: item.type });
            }
        });


        socket.on('disconnect', () => {
            console.log(`Disconnected: ${socket.id}`);
            delete players[socket.id];
            io.emit('playerLeft', { id: socket.id });
        });
    });

    // ===== BOTS =====
    function addBot(id, x, y) {
        players[id] = { id, x, y, bot: true, escaping: false, escapePath: null, alive: true, username: id };
        io.emit('playerJoined', players[id]);
    }

    if(BOT_ENABLED){
        addBot("bot1", 5, 5);
        addBot("bot2", 10, 10);
    }

    setInterval(() => {
        for (const id in players) {
            const p = players[id];
            if (!p.bot) continue;
            if (!players[id]) continue;

            // ако е в режим бягство
            if (p.escaping) {
                if (!isCellDangerous(p.x, p.y)) {
                    p.escaping = false;
                    p.escapePath = null;
                    continue;
                }
                if (!p.escapePath || p.escapePath.length <= 1) {
                    p.escapePath = findSafePath(p.x, p.y);
                }
                if (p.escapePath && p.escapePath.length > 1) {
                    const next = p.escapePath[1];
                    moveBot(p, next.x, next.y);
                    p.escapePath = p.escapePath.slice(1);
                } else {
                    const step = findAnySafeNeighbor(p.x, p.y);
                    if (step) moveBot(p, step.x, step.y);
                }
                continue;
            }

            else if (isCellDangerous(p.x, p.y)) {
                p.escaping = true;
                p.escapePath = findSafePath(p.x, p.y);
                if (p.escapePath && p.escapePath.length > 1) {
                    const next = p.escapePath[1];
                    moveBot(p, next.x, next.y);
                    p.escapePath = p.escapePath.slice(1);
                } else {
                    const step = findAnySafeNeighbor(p.x, p.y);
                    if (step) moveBot(p, step.x, step.y);
                }
                continue;
            }else{

                const target = findNearestPlayer(p);
                if (!target) continue;
                const path = aStar(p.x, p.y, target.x, target.y);
                if (path && path.length > 1) {
                    const step = path[1];

                    if(isCellDangerous(step.x, step.y)) return;

                    moveBot(p, step.x, step.y);

                    if(PEACEFUL_BOTS) return;

                    if (step.x === target.x && step.y === target.y) {
                        placeBomb(p.id);
                    }
                }
            }
        }
    }, 200);

    function moveBot(bot, newX, newY) {
        if (isCellBlocked(newX, newY)) return;
        bot.x = newX;
        bot.y = newY;
        io.emit('playerMoved', { id: bot.id, x: bot.x, y: bot.y });
    }

    function placeBomb(id) {
        const player = players[id];
        if (!player) return;
        const bombX = player.x;
        const bombY = player.y;
        const exists = bombs.some(b => b.bombX === bombX && b.bombY === bombY);
        if (exists) return;

        const explodeAt = Date.now() + 3000;
        const timer = setTimeout(() => explodeBomb(bombX, bombY), 3000);

        bombs.push({ bombX, bombY, timer, explodeAt });
        io.emit('bombPlaced', { id, x: bombX, y: bombY });
    }

    function aStar(sx, sy, ex, ey) {
        const open = [{ x: sx, y: sy, g: 0, f: heuristic(sx, sy, ex, ey), parent: null }];
        const closed = new Set();
        while (open.length > 0) {
            open.sort((a, b) => a.f - b.f);
            const cur = open.shift();
            if (cur.x === ex && cur.y === ey) {
                const path = [];
                let n = cur;
                while (n) { path.unshift({ x: n.x, y: n.y }); n = n.parent; }
                return path;
            }
            closed.add(`${cur.x},${cur.y}`);
            for (const { dx, dy } of [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }]) {
                const nx = cur.x + dx, ny = cur.y + dy;
                if (closed.has(`${nx},${ny}`)) continue;
                if (isCellBlocked(nx, ny)) continue;
                const g = cur.g + 1;
                const f = g + heuristic(nx, ny, ex, ey);
                const exst = open.find(n => n.x === nx && n.y === ny);
                if (!exst) open.push({ x: nx, y: ny, g, f, parent: cur });
                else if (g < exst.g) { exst.g = g; exst.f = f; exst.parent = cur; }
            }
        }
        return null;
    }
    const heuristic = (x1, y1, x2, y2) => Math.abs(x1 - x2) + Math.abs(y1 - y2);

    function isCellBlocked(x, y) {
        if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) return true;
        if (grid[y][x] !== 0) return true;
        if (BOMB_CLIPPING && bombs.some(b => b.bombX === x && b.bombY === y)) return true;
        return false;
    }

    function isCellDangerous(x, y) {
        const now = Date.now();
        return bombs.some(b => {
            const timeLeft = b.explodeAt - now;
            if (timeLeft > 2500) return false; 
            const affected = collectExplosionPreview(b.bombX, b.bombY);
            return affected.has(`${x},${y}`);
        });
    }

    function findSafePath(x, y) {
        const q = [{ x, y, path: [{ x, y }] }];
        const visited = new Set([`${x},${y}`]);
        while (q.length) {
            const n = q.shift();
            if (!isCellDangerous(n.x, n.y)) return n.path;
            for (const { dx, dy } of [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }]) {
                const nx = n.x + dx, ny = n.y + dy;
                if (visited.has(`${nx},${ny}`)) continue;
                if (isCellBlocked(nx, ny)) continue;
                visited.add(`${nx},${ny}`);
                q.push({ x: nx, y: ny, path: [...n.path, { x: nx, y: ny }] });
            }
        }
        return null;
    }

    function findAnySafeNeighbor(x, y) {
        for (const { dx, dy } of [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }]) {
            const nx = x + dx, ny = y + dy;
            if (!isCellBlocked(nx, ny) && !isCellDangerous(nx, ny)) return { x: nx, y: ny };
        }
        return null;
    }

    function findNearestPlayer(bot) {
        let target = null, min = Infinity;
        for (const id in players) {
            const p = players[id];
            if (p.bot) continue;
            if (!p.alive) continue;
            
            const d = Math.abs(bot.x - p.x) + Math.abs(bot.y - p.y);
            if (d < min) { min = d; target = p; }
        }
        return target;
    }

    function collectExplosionPreview(bx, by) {
        const aff = new Set([`${bx},${by}`]);
        for (const { dx, dy } of [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }]) {
            for (let s = 1; s <= 3; s++) {
                const nx = bx + dx * s, ny = by + dy * s;
                if (ny < 0 || ny >= grid.length || nx < 0 || nx >= grid[0].length) break;
                if (grid[ny][nx] === 1) { aff.add(`${nx},${ny}`); break; }
                else if (grid[ny][nx] === 0) aff.add(`${nx},${ny}`);
                else break;
            }
        }
        return aff;
    }

    function checkPlayersInExplosion(aff) {
        for (const id in players) {
            const p = players[id];
            if (aff.has(`${p.x},${p.y}`)) {
                if (!p.bot) {
                    if(!p.alive) return;// already dead

                    players[id].alive = false;
                    //io.to(id).emit('playerDied', {id});
                } else {
                    // bot
                    p.x = Math.floor(Math.random() * grid[0].length);
                    p.y = Math.floor(Math.random() * grid.length);
                }

                io.emit('playerDied', { id });
            }
        }
    }


    function explodeBomb(bx, by) {
        const aff = collectExplosion(bx, by);
        const arr = [...aff].map(s => {
            const [x, y] = s.split(',').map(Number);
            return { x, y };
        });
        io.emit('bombExploded', { x: bx, y: by, affected: arr });
        checkPlayersInExplosion(aff);
    }

    function collectExplosion(bx, by, aff = new Set()) {
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
                            spawnItem(nx, ny);
                        }
                    }
                    
                    break; 
                }
                else if (grid[ny][nx] === 0) aff.add(`${nx},${ny}`);
                else break;
            }
        }
        const chain = bombs.filter(b => aff.has(`${b.bombX},${b.bombY}`));
        chain.forEach(b => { clearTimeout(b.timer); collectExplosion(b.bombX, b.bombY, aff); });
        return aff;
    }

    function spawnItem(x, y) {
        if (grid[y][x] !== 0) return;

        const type = Math.random() < 1 ? "bomb" : "armor";// only bomb
        const id = "item" + (itemIdCounter++);
        const item = { id, x, y, type };
        items.push(item);

        io.emit('itemSpawned', item);
    }

    //return server;
}

//module.exports = { createServer };