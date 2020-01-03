//Credit to Daniel Shiffman at https://github.com/CodingTrain/website/tree/master/Node/sockets for some of the node.js code
//This project was started Dec 3, 2019
const express = require('express');
const app = express();
const server = app.listen(process.env.PORT || 3000);
const io = require('socket.io')(server)
app.use(express.static('public'));
console.log("Server started");

const fps = 17 - 1; //1000 / 60; //Runs at ~60fps, the -1 is to fix innacuracies in JS timing
const timingAccuracy = 0.9; //Lower is more accurate, but it takes more iterations
let lastFrameTime = Date.now();
let deltaTime = 0;

const WIDTH = 3000;
const HEIGHT = 3000;
const baseSize = 17;
const nutritionPerShot = 6;
const spawnerAmmo = 15;
const canShootEvery = 300;

class Vector {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    heading() {
        return Math.atan2(this.y, this.x);
    }

    set(a, b) {
        if (a instanceof Vector) {
            this.x = a.x;
            this.y = a.y;
        } else {
            this.x = a;
            this.y = b;
        }
    }

    copy() {
        return (new Vector(this.x, this.y));
    }

    add(v) {
        this.x += v.x;
        this.y += v.y;
        return this;
    }

    sub(v, z) {
        if (v instanceof Vector) {
            this.x -= v.x;
            this.y -= v.y;
        } else {
            this.x -= v.x;
            this.y -= z.y;
        }
        return this;
    }

    magSq() {
        return (this.x * this.x) + (this.y * this.y);
    }

    mag() {
        return Math.sqrt((this.x * this.x) + (this.y * this.y));
    }

    distSq(other) {
        return Math.pow(this.x - other.x, 2) + Math.pow(this.y - other.y, 2);
    }

    rotate(ang) {
        const currAng = Math.atan2(this.y, this.x);
        const mag = this.mag();
        this.x = Math.cos(currAng + ang) * mag;
        this.y = Math.sin(currAng + ang) * mag;
        return this;
    }

    mult(a, b = null) {
        if (a instanceof Vector) {
            this.x *= a.x;
            this.y *= a.y;
        } else if (b == null) {
            this.x *= a;
            this.y *= a;
        } else {
            this.x *= a;
            this.y *= b;
        }
        return this;
    }

    setMag(m) {
        const currMagSq = (this.x * this.x) + (this.y * this.y);
        if (currMagSq > 0 && m * m != currMagSq) {
            const currMag = Math.sqrt(currMagSq);
            this.x = (this.x / currMag) * m;
            this.y = (this.y / currMag) * m;
        }
        return this;
    }
}

class Circle {
    constructor(x, y, r) {
        this.pos = new Vector(x, y);
        this.r = r;
        this.rSq = r * r;
    }

    changeR(amt) {
        this.r += amt;
        this.rSq = this.r * this.r;
    }

    setR(r) {
        this.r = r;
        this.rSq = r * r;
    }

    hitCircle(other) {
        const xDist = Math.pow(this.pos.x - other.pos.x, 2);
        const yDist = Math.pow(this.pos.y - other.pos.y, 2);
        const rSq = Math.pow(this.r + other.r, 2);
        return (xDist + yDist < rSq);
    }
}

class Square {
    constructor(x, y, w, rot = 0) {
        this.pos = new Vector(x, y); //The position of the square (center)
        this.w = w;
        this.halfW = w * 0.5;
        this.rSq = Math.pow(w * 0.6, 2); //A circle that is in-accurately inscribed
        this.rot = rot;
    }

    hitCircle(other) { //Collision detection btwn a square and circle
        const unRotCircPos = this.pos.copy().sub(other.pos).rotate(-this.rot); //The circ pos relative to this
        const closestX = Math.max(-this.halfW, Math.min(this.halfW, unRotCircPos.x)); //Constrain the circX btwn the left and right of this
        const closestY = Math.max(-this.halfW, Math.min(this.halfW, unRotCircPos.y)); //Constrain the circY btwn the top and bottom of this
        const dSq = Math.pow(unRotCircPos.x - closestX, 2) + Math.pow(unRotCircPos.y - closestY, 2);

        return (dSq < other.rSq);
    }

    hitSquare(other) { //Innacurate collision detection, others hitbox is a circle...
        const unRotOtherPos = this.pos.copy().sub(other.pos).rotate(-this.rot); //The circ pos relative to this
        const closestX = Math.max(-this.halfW, Math.min(this.halfW, unRotOtherPos.x)); //Constrain the circX btwn the left and right of this
        const closestY = Math.max(-this.halfW, Math.min(this.halfW, unRotOtherPos.y)); //Constrain the circY btwn the top and bottom of this
        const dSq = Math.pow(unRotOtherPos.x - closestX, 2) + Math.pow(unRotOtherPos.y - closestY, 2);

        return (dSq < other.rSq);
    }

    getCorners() {
        return [
            new Vector(this.halfW, this.halfW).rotate(this.rot).add(this.pos),
            new Vector(-this.halfW, this.halfW).rotate(this.rot).add(this.pos),
            new Vector(this.halfW, -this.halfW).rotate(this.rot).add(this.pos),
            new Vector(-this.halfW, -this.halfW).rotate(this.rot).add(this.pos)
        ];
    }
}

class Rectangle {
    constructor(x, y, w, h) {
        this.pos = new Vector(x, y);
        this.w = w;
        this.h = h;
    }

    contains(point) {
        return (point.x > this.pos.x && point.x < this.pos.x + this.w && point.y > this.pos.y && point.y < this.pos.y + this.h);
    }
}

class GridRect extends Rectangle {
    constructor(x, y, w, h) {
        super(x, y, w, h);
        this.contains = [];
    }

    add(obj) {
        this.contains.push(obj);
    }

    remove(obj) {
        this.contains.splice(this.contains.indexOf(obj), 1);
    }
}

class Grid {
    constructor(x, y, w, h, amtW, amtH) {
        this.rect = new Rectangle(x, y, w, h);

        this.rectW = WIDTH / amtW;
        this.rectH = HEIGHT / amtH;
        this.rects = [];

        for (let x = this.rect.pos.x; x < this.rect.w; x += this.rectW) {
            this.rects.push([]);
            for (let y = this.rect.pos.y; y < this.rect.h; y += this.rectH) {
                this.rects[x / this.rectW].push(new GridRect(x, y, this.rectW, this.rectH));
            }
        }
    }

    getWithin(x, y, w, h) {
        let objs = [];
        let adjBoundary = new Rectangle(
            Math.floor(x / this.rectW) * this.rectW,
            Math.floor(y / this.rectH) * this.rectH, //A rectangle that snapped onto the closest grid lines
            Math.ceil(((x + w) / this.rectW)) * this.rectW - x,
            Math.ceil(((y + h) / this.rectH)) * this.rectH - y);

        for (let x = adjBoundary.pos.x; x <= adjBoundary.pos.x + adjBoundary.w; x += this.rectW) {
            for (let y = adjBoundary.pos.y; y <= adjBoundary.pos.y + adjBoundary.h; y += this.rectH) {
                let xIndex = Math.floor(x / this.rectW);
                let yIndex = Math.floor(y / this.rectH); //Make sure rect is valid
                if (xIndex >= 0 && xIndex < this.rects.length && yIndex >= 0 && yIndex < this.rects[xIndex].length) {
                    objs = objs.concat(this.rects[xIndex][yIndex].contains);
                }
            }
        }
        return objs;
    }

    add(obj) {
        let inX = Math.floor(obj.pos.x / this.rectW);
        let inY = Math.floor(obj.pos.y / this.rectH);
        this.rects[inX][inY].add(obj);
    }

    remove(obj) {
        let inX = Math.floor(obj.pos.x / this.rectW);
        let inY = Math.floor(obj.pos.y / this.rectH);
        this.rects[inX][inY].remove(obj);
    }
}

class Spawner extends Square {
    constructor(x, y, w) {
        super(x, y, w, Math.random() * Math.PI * 2);
        this.lastSpawn = Date.now(); //It will wait a second before spawning
        this.spawnEvery = (Math.random() * 3000) + 5000;
        this.amtShot = 0;
        this.rotSpeed = 0.001 * (Math.random() < 0.5 ? 1 : -1); //Rotates in a random dir
    }

    regenerate(newPos) {
        this.pos.set(newPos);
        this.amtShot = 0;
        this.lastSpawn = Date.now();
        this.spawnEvery = (Math.random() * 3000) + 5000;
        this.rotSpeed = 0.001 * (Math.random() < 0.5 ? 1 : -1); //Rotates in a random dir
        this.w = 20 + (Math.random() * 20);
    }

    shouldSpawn() {
        return (this.lastSpawn + this.spawnEvery <= Date.now());
    }

    spawn() {
        this.lastSpawn = Date.now();
        this.amtShot++;
        return new Mover(this.pos.x, this.pos.y, this.w * 0.8, 0.2, this.rot);
    }

    update() {
        this.rot += this.rotSpeed * deltaTime;
    }

    serialize() {
        return {
            'x': this.pos.x,
            'y': this.pos.y,
            'w': this.w,
            'rot': this.rot,
            'rotS': this.rotSpeed,
            'lastSpawn': this.lastSpawn,
            'spawnEvery': this.spawnEvery
        }
    }
}

class Mover extends Square {
    constructor(x, y, w, speed, dir, passiveFor = 200) {
        super(x, y, w, dir);
        this.speed = speed;
        this.vel = new Vector(speed * Math.cos(dir), speed * Math.sin(dir));
        this.passiveFor = passiveFor;
        this.spawnedAt = Date.now();
    }

    move() {
        const newVel = this.vel.copy();
        newVel.setMag(this.speed * deltaTime);
        this.pos.add(newVel);
        const corners = this.getCorners();

        let bounceX = false;
        let bounceY = false;
        for (let corner of corners) {
            if ((corner.x < 0 && this.vel.x < 0) || (corner.x > WIDTH && this.vel.x > 0)) bounceX = true;
            if ((corner.y < 0 && this.vel.y < 0) || (corner.y > HEIGHT && this.vel.y > 0)) bounceY = true;
        }

        if (bounceX) {
            this.vel.x *= -1;
            this.rot = Math.atan2(this.vel.y, this.vel.x);
            if (this.speed < 0.4) {
                this.vel.mult(1.2);
                this.speed *= 1.2;
            }
        }
        if (bounceY) {
            this.vel.y *= -1;
            this.rot = Math.atan2(this.vel.y, this.vel.x);
            if (this.speed < 0.4) {
                this.vel.mult(1.2);
                this.speed *= 1.2;
            }
        }
    }

    isPassive() {
        return this.spawnedAt + this.passiveFor > Date.now();
    }

    serialize() {
        return {
            'x': this.pos.x,
            'y': this.pos.y,
            'w': this.w,
            'rot': this.rot,
            'velX': this.vel.x,
            'velY': this.vel.y
        }
    }
}

class Player extends Circle {
    constructor(name, x, y, s, canvasW, canvasH) {
        super(x, y, baseSize);

        this.name = name;

        this.nutrition = 0;
        this.nutritionPerLayer = 12;

        this.layers = 0;
        this.layerWidth = 5;
        this.maxLayers = Math.floor(((Math.min(WIDTH, HEIGHT) * 0.5) - baseSize) / this.layerWidth); //The maximum amount of layers being bigger than the arena

        this.lastShot = 0;

        this.canvasW = canvasW;
        this.canvasH = canvasH;

        this.speed = s;
        this.vel = new Vector(0, 0);
    }

    setCanvasSize(w, h) {
        this.canvasW = w;
        this.canvasH = h;
    }

    getVisualBounds() {
        const scl = 1 + (this.r - baseSize) / (100 - baseSize); //map(player.r, baseSize, 100, 1, 2);
        const sclW = this.canvasW * scl;
        const sclH = this.canvasH * scl;
        return new Rectangle(
            this.pos.x - (sclW * 0.5),
            this.pos.y - (sclH * 0.5),
            sclW,
            sclH
        )
    }

    canShoot() {
        return (this.lastShot + canShootEvery) < Date.now();
    }

    setData(d) {
        this.pos.set(d.x, d.y);
        this.vel.set(d.vx, d.vy);
    }

    hit() {
        this.eat(-this.nutritionPerLayer); //Make the player lose one layer
        return (this.nutrition < 0); //True - Player is dead
    }

    eat(nutrition) {
        this.nutrition += nutrition;
        this.layers = Math.floor(this.nutrition / this.nutritionPerLayer);
        if (this.layers > this.maxLayers) this.layers = this.maxLayers;
        this.setR(baseSize + (this.layers * this.layerWidth));
    }

    serialize() {
        return {
            'name': this.name,
            'x': this.pos.x,
            'y': this.pos.y,
            'speed': this.speed,
            'velX': this.vel.x,
            'velY': this.vel.y,
            'layers': this.layers,
            'layerWidth': this.layerWidth,
            'nutrition': this.nutrition
        }
    }
}

class Dot extends Circle {
    constructor(x, y) {
        super(x, y, 3);
        this.nutrition = 1;
    }

    serialize() {
        return {
            'x': this.pos.x,
            'y': this.pos.y,
            'r': this.r
        }
    }
}

class Game {
    constructor() {
        this.players = {};
        this.dotsGrid = new Grid(0, 0, WIDTH, HEIGHT, 10, 10);
        this.movers = [];
        this.spawners = [];
        for (let i = 0; i < 10; i++) {
            let pos = this.findSpawnLocation();
            this.spawners.push(new Spawner(pos.x, pos.y, 20 + (Math.random() * 20)));
        }
        for (let i = 0; i < 500; i++) {
            this.spawnDot();
        }

        this.lastDotSpawn = 0;
        this.spawnDotEvery = 300;
    }

    update() {
        for (let playerId in this.players) {
            const player = this.players[playerId];
            const closeDots = this.dotsGrid.getWithin(player.pos.x - player.r, player.pos.y - player.r, player.r * 2, player.r * 2);
            for (let i = closeDots.length - 1; i >= 0; i--) {
                if (player.hitCircle(closeDots[i])) {
                    player.eat(closeDots[i].nutrition);
                    this.dotsGrid.remove(closeDots[i]);
                    // this.dots.splice(i, 1);
                }
            }
        }

        for (let i = this.movers.length - 1; i >= 0; i--) {
            const mover = this.movers[i];
            mover.move();

            if (!mover.isPassive()) {
                for (let spawner of this.spawners) {
                    if (mover.hitSquare(spawner)) {
                        mover.pos.set(spawner.pos);
                        mover.rot = spawner.rot;
                        mover.vel = new Vector(mover.speed * Math.cos(mover.rot), mover.speed * Math.sin(mover.rot));
                        mover.passiveFor = 200;
                        mover.spawnedAt = Date.now();
                    }
                }

                let shouldRemove = false;
                for (let j = i - 1; j >= 0; j--) {
                    if (mover.hitSquare(this.movers[j])) {
                        shouldRemove = true;
                        this.movers.splice(j, 1);
                        i--;
                    }
                }
                if (!shouldRemove) {
                    const playerKeys = Object.keys(this.players);
                    for (let j = playerKeys.length - 1; j >= 0; j--) {
                        const playerId = playerKeys[j];
                        if (mover.hitCircle(this.players[playerId])) {
                            shouldRemove = true;
                            let dead = this.players[playerId].hit();
                            if (dead) {
                                io.to(playerId).emit('lost');
                                this.removePlayer(playerId);
                            }
                        }
                    }
                }

                if (shouldRemove) this.movers.splice(i, 1);
            }
        }

        for (let spawner of this.spawners) {
            spawner.update();
            if (spawner.shouldSpawn()) {
                this.movers.push(spawner.spawn());
                if (spawner.amtShot > spawnerAmmo) {
                    spawner.regenerate(this.findSpawnLocation());
                }
            }
        }

        if (this.lastDotSpawn + this.spawnDotEvery < Date.now()) {
            this.spawnDot();
            this.lastDotSpawn = Date.now();
        }
    }

    shoot(playerId, dir) {
        const player = this.players[playerId];
        if (player.nutrition >= 12 && player.canShoot()) {
            const moverW = Math.pow(player.r, 0.8);
            const mag = player.r + (moverW * 0.5) + 5; //The * 1.5 is because that includes the w/2 of the mover
            const moverVector = new Vector(mag * Math.cos(dir), mag * Math.sin(dir)); //player.vel.copy().setMag(player.r + (moverW * 0.5) + 5); 
            const moverPos = player.pos.copy().add(moverVector);

            this.movers.push(new Mover(moverPos.x, moverPos.y, moverW, player.speed * 1.7, dir, 50));
            player.eat(-nutritionPerShot);
            player.lastShot = Date.now();
        }
    }

    spawnDot() {
        this.dotsGrid.add(new Dot(Math.random() * WIDTH, Math.random() * HEIGHT));
    }

    findSpawnLocation() {
        const border = 150;
        const minDist = Math.pow(350, 2);

        let point = new Vector(Math.random() * WIDTH, Math.random() * HEIGHT);
        point.x = Math.max(border, Math.min(WIDTH - border, point.x));
        point.y = Math.max(border, Math.min(HEIGHT - border, point.y));

        let attempts = 0;
        while (this.findClosestEnemy(point) < minDist && attempts < 500) {
            point = new Vector(Math.random() * WIDTH, Math.random() * HEIGHT);
            point.x = Math.max(border, Math.min(WIDTH - border, point.x));
            point.y = Math.max(border, Math.min(HEIGHT - border, point.y));
            attempts++;
        }
        return point;
    }

    findClosestEnemy(point) {
        const others = [...this.movers, ...this.spawners, ...Object.values(this.players)];
        if (others.length === 0) {
            return Infinity;
        }
        let closestDist = others[0].pos.distSq(point);
        for (let i = 1; i < others.length; i++) {
            const d = others[i].pos.distSq(point);
            if (d < closestDist) {
                closestDist = d;
            }
        }
        return closestDist;
    }

    getGameData() {
        let data = {
            'movers': [],
            'spawners': []
        };
        for (let mover of this.movers) {
            data.movers.push(mover.serialize());
        }
        for (let spawner of this.spawners) {
            data.spawners.push(spawner.serialize());
        }
        return data;
    }

    getPlayerData(exceptForId) {
        let playersArr = [];
        for (let playerId in this.players) {
            if (playerId != exceptForId) playersArr.push(this.players[playerId].serialize());
        }
        return playersArr;
    }

    removePlayer(id) {
        if (this.players[id] !== undefined) {
            delete this.players[id];
        }
    }
}

io.sockets.on('connection', socket => {
    console.log("New Client: " + socket.id);

    io.to(socket.id).emit('connected');

    socket.on('joinGame', data => {
        let spawn = game.findSpawnLocation();
        game.players[socket.id] = new Player(data.name, spawn.x, spawn.y, 0.2, data.canvasW, data.canvasH);

        io.to(socket.id).emit('joined', {
            'dimX': WIDTH,
            'dimY': HEIGHT,
            'name': game.players[socket.id].name,
            'baseSize': baseSize,
            'playerX': game.players[socket.id].pos.x,
            'playerY': game.players[socket.id].pos.y,
            'startR': game.players[socket.id].r,
            'playerS': game.players[socket.id].speed
        });
    });

    socket.on('canvasSize', data => {
        game.players[socket.id].setCanvasSize(data.canvasW, data.canvasH);
    });
    socket.on('pos', data => {
        if (game.players[socket.id]) {
            game.players[socket.id].setData(data);
        }
    });
    socket.on('shoot', dir => {
        game.shoot(socket.id, dir);
    });

    socket.on('disconnect', () => {
        console.log(socket.id + " disconnected");
        game.removePlayer(socket.id);
    });
});

function sendData() {
    let gameData = game.getGameData();
    for (let socketId in game.players) {
        const player = game.players[socketId];
        const visualBounds = player.getVisualBounds();
        let closeDots = game.dotsGrid.getWithin(visualBounds.pos.x - 5, visualBounds.pos.y - 5, visualBounds.w + 10, visualBounds.h + 10);
        closeDots = closeDots.map(d => d.serialize());

        io.to(socketId).emit('gameData', {
            'you': {
                'nutrition': game.players[socketId].nutrition,
            },
            'dots': closeDots,
            'movers': gameData.movers,
            'spawners': gameData.spawners,
            'others': game.getPlayerData(socketId)
        }); //Send each client the other clients (not including them)
    }
}

let game = new Game();

let nextTime = Date.now();

function gameLoop() {
    let now = Date.now();
    if (now >= nextTime) {
        deltaTime = now - lastFrameTime;
        lastFrameTime = now;

        if (Object.keys(game.players).length > 0) { //Only update the game when players are connected
            game.update();
        }
        sendData();


        nextTime = now + fps;
        const timeToWait = nextTime - Date.now(); //Exactly how long to wait until the next frame
        setTimeout(gameLoop, timeToWait * timingAccuracy); //Because JS timers sometimes take extra, decreause to be more precise
    } else {
        const timeToWait = nextTime - now;
        setTimeout(gameLoop, timeToWait * timingAccuracy);
    }
}
gameLoop();

//Allows an interactive console
let stdin = process.openStdin();
stdin.addListener("data", s => {
    let str = s.toString().trim();
    if (str.slice(0, 6) == "player") {
        eval("game.players[Object.keys(game.players)[0]]" + str.slice(6));
    } else if (str.slice(0, 4) == "log ") {
        try {
            eval("console.log(" + str.slice(4) + ");");
        } catch (e) {
            console.error("Error!");
            console.error(e);
        }
    } else if (str.slice(0, 7) == "repeat ") {
        const amt = parseInt(str.split(' ')[1]);
        const fn = str.slice(str.split(' ')[0].length + str.split(' ')[1].length + 2);
        for (let i = 0; i < amt; i++) {
            eval(fn);
        }
    } else {
        try {
            eval(s.toString().trim());
        } catch (e) {
            console.error("Error!");
            console.error(e);
        }
    }
});