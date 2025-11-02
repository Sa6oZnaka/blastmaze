const gameRooms = require('./gameRooms');
const db = require('./dbInit'); // или пътя, където ти е db файла

module.exports = function (io){


    const items = []; // { id, x, y, type }
    let itemIdCounter = 0;


    // SETTINGS //
    let BOT_ENABLED = true;
    let PEACEFUL_BOTS = true;
    let DROP_ENABLED = true;
    let DROP_CHANCE = 0.02;
    let BOMB_CLIPPING = true;

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

        socket.on('cancelSearch', () => {
            const room = gameRooms.findRoomByPlayer(socket.id);
            if (!room) return;

            delete room.players[socket.id];
        });


        socket.on('findGame', ({ mode }) => {
            const room = gameRooms.findOrCreateRoom(mode);
            socket.join(room.id);

            let posX = Math.floor(Math.random() * room.grid[0].length);
            let posY = Math.floor(Math.random() * room.grid.length);

            const player = {
                id: socket.id,
                x: posX,
                y: posY,
                bot: false,
                username: socket.handshake.session.user.username,
                alive: true,
                rounds: 0
            };

            gameRooms.addPlayerToRoom(room, player);

            const nonBotCount = Object.values(room.players).filter(p => !p.bot).length;
            
            if(!room.started){
                if(nonBotCount >= room.requiredToStart){
                    room.started = true;
                    // Пращаме на всички чакащи да почне
                    sendRoomData(room, true);
                }
            }else{
                // Изпращаме данни за стаята на този клиент
                //socket.emit('roomData', {
                socket.emit('matchFound', {
                    roomId: room.id,
                    round: room.round,
                    grid: room.grid,
                    players: Object.values(room.players).map(p => ({
                        id: p.id,
                        x: p.x,
                        y: p.y,
                        alive: p.alive,
                        bot: p.bot,
                        username: p.username
                    })),
                    items: room.items.map(i => ({ id: i.id, x: i.x, y: i.y, type: i.type })),
                    bombs: room.bombs.map(b => ({ x: b.bombX, y: b.bombY, explodeAt: b.explodeAt })),
                    respawn: room.allowRespawn,
                    showRounds: room.rounds > 1
                });
            }

            console.log(`Connected: ${socket.id} (room ${room.id})`);

            // Известяване на другите играчи в стаята
            socket.to(room.id).emit('playerJoined', player);
        });


        socket.on('move', ({ dx, dy }) => {
            const room = gameRooms.findRoomByPlayer(socket.id);
            if (!room) return;

            const player = room.players[socket.id];
            if (!player) return;
            
            if(gameRooms.isCellBlocked(room.id, player.x + dx, player.y + dy)){
                socket.emit("revertMove", ({x: player.x, y: player.y}));
                return;
            }

            player.x += dx;
            player.y += dy;

            io.to(room.id).emit('playerMoved', { id: socket.id, x: player.x, y: player.y });
        });

        socket.on('respawn', () => {
            const room = gameRooms.findRoomByPlayer(socket.id);
            if (!room) return;

            if (!room.allowRespawn) return;

            const player = room.players[socket.id];
            if (!player) return;

            player.y = Math.floor(Math.random() * room.grid[0].length);
            player.y = Math.floor(Math.random() * room.grid.length);
            player.alive = true;

            io.to(room.id).emit('playerRespawned', player);
        });

        
        socket.on('placeBomb', () => {
            const room = gameRooms.findRoomByPlayer(socket.id);
            if (!room) return;

            const player = room.players[socket.id];
            if (!player) return;

            const bombX = player.x;
            const bombY = player.y;
            
            const exists = room.bombs.some(b => b.bombX === bombX && b.bombY === bombY);
            if (exists) return;

            const explodeAt = Date.now() + 3000;
            const timer = setTimeout(() => explodeBomb(room.id, bombX, bombY), 3000);

            //addBombToRoom()
            room.bombs.push({ bombX, bombY, timer, explodeAt });
            io.to(room.id).emit('bombPlaced', { id: "ne znam", x: bombX, y: bombY });
        });

        socket.on('pickupItem', ({ itemId }) => {
            const room = gameRooms.findRoomByPlayer(socket.id);
            if (!room) return;
            const player = room.players[socket.id];
            if (!player) return;

            const idx = room.items.findIndex(it => it.id === itemId);
            if (idx === -1) return;

            const item = room.items[idx];
            if (player.x === item.x && player.y === item.y) {
                room.items.splice(idx, 1);
                io.to(room.id).emit('itemPicked', { playerId: socket.id, itemId: item.id, type: item.type });
            }
        });

        socket.on('disconnect', () => {
            const room = gameRooms.findRoomByPlayer(socket.id);
            if (!room) return;

            delete room.players[socket.id];
            io.to(room.id).emit('playerLeft', { id: socket.id });

            // ако няма никой останал в стаята, може да я изтриеш
            const playerCount = Object.values(room.players).filter(p => !p.bot).length;
            if (playerCount === 0) {
                gameRooms.removeRoom(room.id);
            }

            console.log(`Disconnected: ${socket.id} (room ${room.id})`);

            checkForWinner(room);
        });
    });

    // todo
    // ===== BOTS =====
    function addBotToRoom(room, id, x, y) {
        const bot = { id, x, y, bot: true, escaping: false, escapePath: null, alive: true, username: id };
        room.players[id] = bot;
        io.to(room.id).emit('playerJoined', bot);
    }

/*
    if(BOT_ENABLED){
        addBot("bot1", 5, 5);
        addBot("bot2", 10, 10);
    }
*/
    setInterval(() => {
        const allRooms = Object.values(gameRooms); // но при теб е module, не директно обект
        const rooms = Object.values(require('./gameRooms').getAllRooms ? gameRooms.getAllRooms() : require('./gameRooms').rooms || {});

        for (const room of rooms) {
            const grid = room.grid;
            const bombs = room.bombs;

            for (const id in room.players) {
                const p = room.players[id];
                if (!p.bot || !p.alive) continue;

                // === ESCAPING ===
                if (p.escaping) {
                    if (!isCellDangerous(room, p.x, p.y)) {
                        p.escaping = false;
                        p.escapePath = null;
                        continue;
                    }
                    if (!p.escapePath || p.escapePath.length <= 1) {
                        p.escapePath = findSafePath(room, p.x, p.y);
                    }
                    if (p.escapePath && p.escapePath.length > 1) {
                        const next = p.escapePath[1];
                        moveBot(room, p, next.x, next.y);
                        p.escapePath = p.escapePath.slice(1);
                    } else {
                        const step = findAnySafeNeighbor(room, p.x, p.y);
                        if (step) moveBot(room, p, step.x, step.y);
                    }
                    continue;
                }

                // === CHECK DANGER ===
                else if (isCellDangerous(room, p.x, p.y)) {
                    p.escaping = true;
                    p.escapePath = findSafePath(room, p.x, p.y);
                    continue;
                }

                // === HUNT PLAYERS ===
                const target = findNearestPlayer(room, p);
                if (!target) continue;

                // ако е много близо — опитваме да сложим бомба
                const dist = Math.abs(p.x - target.x) + Math.abs(p.y - target.y);
                // условияхe: ако е на съседна или на две клетки — може да опита да сложи
                if (dist <= 2) {
                    // допълнителна безопасност: не слагай ако собственото място вече е опасно и няма escape path
                    if (canBotPlaceBomb(room, p)) {
                        // Ако ботът би се самоубил (няма път за бягство), може да се отказваме — но тук ще опитаме да намерим път
                        const potentialEscape = findSafePath(room, p.x, p.y);
                        if (potentialEscape) {
                            botPlaceBomb(room, p);
                            // продължаваме към следващия бот (вече маркиран като escaping)
                            continue;
                        } else {
                            // ако няма безопасен път, може да опитаме да преместим бота на съседна безопасна клетка, вместо да поставяме
                            const step = findAnySafeNeighbor(room, p.x, p.y);
                            if (step) {
                                moveBot(room, p, step.x, step.y);
                                continue;
                            }
                        }
                    }
                }

                const path = aStar(room, p.x, p.y, target.x, target.y);
                if (path && path.length > 1) {
                    const step = path[1];
                    if (isCellDangerous(room, step.x, step.y)) continue;
                    moveBot(room, p, step.x, step.y);
                }
            }
        }
    }, 250);

    function botPlaceBomb(room, bot) {
        const bombX = bot.x;
        const bombY = bot.y;

        // Проверка дали вече има бомба на същото място
        const exists = room.bombs.some(b => b.bombX === bombX && b.bombY === bombY);
        if (exists) return false;

        const explodeAt = Date.now() + 3000;

        const timer = setTimeout(() => explodeBomb(room.id, bombX, bombY), 3000);

        room.bombs.push({ bombX, bombY, timer, explodeAt });

        io.to(room.id).emit('bombPlaced', { id: bot.id, x: bombX, y: bombY });

        bot.lastBombAt = Date.now();

        bot.escaping = true;
        bot.escapePath = findSafePath(room, bot.x, bot.y);
        return true;
    }

    function canBotPlaceBomb(room, bot) {
        const now = Date.now();
        const COOLDOWN = 400;
        if (bot.lastBombAt && now - bot.lastBombAt < COOLDOWN) return false;
        if (room.bombs.some(b => b.bombX === bot.x && b.bombY === bot.y)) return false;
        if (isCellBlocked(room, bot.x, bot.y)) return false;
        return true;
    }

    function moveBot(room, bot, newX, newY) {
        if (isCellBlocked(room, newX, newY)) return;
        bot.x = newX;
        bot.y = newY;
        io.to(room.id).emit('playerMoved', { id: bot.id, x: bot.x, y: bot.y });
    }

    function aStar(room, sx, sy, ex, ey) {
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
                if (isCellBlocked(room, nx, ny)) continue;
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

    function isCellBlocked(room, x, y) {
        const grid = room.grid;

        if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) return true;
        if (grid[y][x] !== 0) return true;
        if (BOMB_CLIPPING && room.bombs.some(b => b.bombX === x && b.bombY === y)) return true;
        return false;
    }

    function isCellDangerous(room, x, y) {
        const now = Date.now();

        return room.bombs.some(b => {
            const timeLeft = b.explodeAt - now;
            if (timeLeft > 2500) return false; 
            const affected = collectExplosionPreview(room, b.bombX, b.bombY);
            return affected.has(`${x},${y}`);
        });
    }

    function findSafePath(room, x, y) {
        const q = [{ x, y, path: [{ x, y }] }];
        const visited = new Set([`${x},${y}`]);
        while (q.length) {
            const n = q.shift();
            if (!isCellDangerous(room, n.x, n.y)) return n.path;
            for (const { dx, dy } of [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }]) {
                const nx = n.x + dx, ny = n.y + dy;
                if (visited.has(`${nx},${ny}`)) continue;
                if (isCellBlocked(room, nx, ny)) continue;
                visited.add(`${nx},${ny}`);
                q.push({ x: nx, y: ny, path: [...n.path, { x: nx, y: ny }] });
            }
        }
        return null;
    }

    function findAnySafeNeighbor(room, x, y) {
        for (const { dx, dy } of [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }]) {
            const nx = x + dx, ny = y + dy;
            if (!isCellBlocked(room, nx, ny) && !isCellDangerous(room, nx, ny)) return { x: nx, y: ny };
        }
        return null;
    }

    function findNearestPlayer(room, bot) {
        let target = null, min = Infinity;
        for (const id in room.players) {
            const p = room.players[id];
            if (p.bot || !p.alive) continue;
            const d = Math.abs(bot.x - p.x) + Math.abs(bot.y - p.y);
            if (d < min) { min = d; target = p; }
        }
        return target;
    }

    function collectExplosionPreview(room, bx, by) {
        const grid = room.grid;
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

    function checkPlayersInExplosion(roomId, aff) {
        const room = gameRooms.getRoom(roomId);
        if (!room) return;

        const players = room.players;

        const aliveBefore = Object.values(players).filter(p => p.alive && !p.bot);

        const deadThisTick = [];

        for (const id in players) {
            const p = players[id];
            if (aff.has(`${p.x},${p.y}`)) {
                if (!p.bot) {
                    if (!p.alive) continue;

                    p.alive = false;
                    deadThisTick.push(p);
                } else {
                    p.x = Math.floor(Math.random() * room.grid[0].length);
                    p.y = Math.floor(Math.random() * room.grid.length);
                }

                io.emit('playerDied', { id });
            }
        }

        // ако не може да се респаунем и има умрял
        if (!room.allowRespawn && deadThisTick.length > 0) {
            checkForWinner(room, aliveBefore, deadThisTick);
        }
    }

    function sendRoomData(room, v2){
        if(v2){
            io.to(room.id).emit('matchFound', {
            roomId: room.id,
            round: room.round,
            grid: room.grid,
            players: Object.values(room.players).map(p => ({
                id: p.id,
                x: p.x,
                y: p.y,
                alive: p.alive,
                bot: p.bot,
                username: p.username
            })),
            items: room.items.map(i => ({ id: i.id, x: i.x, y: i.y, type: i.type })),
            bombs: room.bombs.map(b => ({ x: b.bombX, y: b.bombY, explodeAt: b.explodeAt })),
            respawn: room.allowRespawn,
            showRounds: room.rounds > 1
        });

        return;
        }



        io.to(room.id).emit('roomData', {
            roomId: room.id,
            round: room.round,
            grid: room.grid,
            players: Object.values(room.players).map(p => ({
                id: p.id,
                x: p.x,
                y: p.y,
                alive: p.alive,
                bot: p.bot,
                username: p.username
            })),
            items: room.items.map(i => ({ id: i.id, x: i.x, y: i.y, type: i.type })),
            bombs: room.bombs.map(b => ({ x: b.bombX, y: b.bombY, explodeAt: b.explodeAt })),
            respawn: room.allowRespawn,
            showRounds: room.rounds > 1
        });
    }

    function checkForWinner(room) {
        if (!room || room.allowRespawn) return;

        const players = room.players;
        const alivePlayers = Object.values(players).filter(p => p.alive && !p.bot);
        let winner = null;
        let draw = false;

        if (alivePlayers.length === 1) {
            winner = alivePlayers[0];
            winner.rounds = (winner.rounds || 0) + 1;
        } else if (alivePlayers.length === 0) {
            draw = true;
        } else {
            return; // още не е свършил рунда
        }

        const playersArr = Object.values(players);
        const majorityWins = Math.ceil(room.rounds / 2);
        const potentialWinner = playersArr.find(p => (p.rounds || 0) >= majorityWins && !p.bot);

        const isFinal = room.round === room.rounds || !!potentialWinner;

        if (isFinal) {
            const maxRounds = Math.max(...playersArr.map(p => p.rounds || 0));
            const topPlayers = playersArr.filter(p => (p.rounds || 0) === maxRounds && !p.bot);

            let finalWinner = null;
            let finalDraw = false;

            if (topPlayers.length === 1) {
                finalWinner = topPlayers[0];
            } else {
                finalDraw = true;
            }

            const usernames = playersArr.map(p => p.username).filter(Boolean);

            db.query(
                'SELECT username, level_points, rank_points, wins FROM user WHERE username IN (?)',
                [usernames],
                (err, results) => {
                    if (err) {
                        console.error('DB select error:', err);
                        return;
                    }

                    const finalPlayers = playersArr.map(p => {
                        const user = results.find(r => r.username === p.username);

                        const baseXP = (p.rounds || 0) * 10;
                        const bonusXP = (finalWinner && finalWinner.username === p.username) ? 50 : 0;
                        const gainedXP = baseXP + bonusXP;
                        const gainedRank = gainedXP * 0.3;
                        const gainedWins = (finalWinner && finalWinner.username === p.username) ? 1 : 0;

                        const oldXP = user ? user.level_points : 0;
                        const oldRank = user ? user.rank_points : 0;
                        const oldWins = user ? user.wins : 0;

                        const newXP = oldXP + gainedXP;
                        const newRank = oldRank + gainedRank;
                        const newWins = oldWins + gainedWins;

                        db.query(
                            'UPDATE user SET level_points = ?, rank_points = ?, wins = ? WHERE username = ?',
                            [newXP, newRank, newWins, p.username],
                            (err2) => {
                                if (err2) console.error('DB update error:', err2);
                            }
                        );

                        return {
                            id: p.id,
                            username: p.username,
                            rounds: p.rounds || 0,
                            gainedXP,
                            gainedRank,
                            oldXP,
                            newXP,
                            oldRank,
                            newRank,
                            oldWins,
                            newWins
                        };
                    });

                    io.to(room.id).emit('gameEnded', {
                        players: finalPlayers,
                        winner: finalWinner
                            ? { id: finalWinner.id, username: finalWinner.username }
                            : null,
                        draw: finalDraw
                    });

                    gameRooms.removeRoom(room.id);
                }
            );

            return;
        }

        // === Ако играта продължава ===
        room.round++;
        io.to(room.id).emit('roundEnded', {
            round: room.round,
            winner: winner ? { id: winner.id, name: winner.username || winner.name } : null,
            draw: draw || !winner
        });

        gameRooms.nextRound(room.id);

        setTimeout(() => {
            sendRoomData(room);
        }, 3000);
    }

    function explodeBomb(roomId, bx, by) {
        if(!gameRooms.hasBomb(roomId, bx, by)) return;

        const aff = gameRooms.collectExplosion(roomId, bx, by);
        const arr = [...aff].map(s => {
            const [x, y] = s.split(',').map(Number);
            return { x, y };
        });
        io.emit('bombExploded', { x: bx, y: by, affected: arr });
        checkPlayersInExplosion(roomId, aff);
    }

    function spawnItem(x, y) {
        if (grid[y][x] !== 0) return;

        const type = Math.random() < 1 ? "bomb" : "armor";// only bomb
        const id = "item" + (itemIdCounter++);
        const item = { id, x, y, type };
        items.push(item);

        io.emit('itemSpawned', item);
    }

}