let socket;
let status = "loading";
let initialConnect = false;

let menuDiv;
let nameInp;
let joinButton;

const NOT_CONNECTED = 0;
const LOBBY = 1;
const INGAME = 2;

let gameData = {
    'dots': [],
    'movers': [],
    'spawners': [],
    'others': []
}
let justReceived = false;

let state = NOT_CONNECTED;

let deltaTime = 0;
let lastFrameTime = Date.now();

let player;

let halfW;
let halfH;

let gameDim;
let scl = 1;
let baseSize = 17;

function setup() {
    createCanvas(windowWidth, windowHeight);
    textAlign(CENTER);
    halfW = width / 2;
    halfH = height / 2;
    frameRate(30);

    menuDiv = select("#menu");
    nameInp = select("#name");
    nameInp.value("Player" + floor(random(10000)).toString().padStart(4, '0'));
    joinButton = select("#join");
    joinButton.mouseClicked(() => {
        if (state == LOBBY) {
            socket.emit('joinGame', nameInp.value());
        }
    })


    socket = io({
        'reconnection': false
    }); //Connect the client, and don't reconnect if disconnected
    socket.on('connected', () => {
        state = LOBBY;
        menuDiv.show();
    });
    socket.on('joined', d => {
        console.log("joined!");
        menuDiv.hide();

        gameData = {
            'dots': [],
            'movers': [],
            'spawners': [],
            'others': []
        }

        gameDim = createVector(d.dimX, d.dimY); //The dimensions of the playfield
        baseSize = d.baseSize;
        player = new Player(d.name, d.playerX, d.playerY, d.playerS);

        state = INGAME;
    });
    socket.on('lost', () => {
        menuDiv.show();
        state = LOBBY;
    });
    socket.on('gameData', d => {
        if (state == INGAME) {
            receivedData(d);
        }
    });
}

function receivedData(d) {
    const dTime = Date.now() - d.timeSent;
    gameData = {
        'dots': [],
        'movers': [],
        'spawners': [],
        'others': []
    };
    for (let dot of d.dots) {
        gameData.dots.push(new Dot(dot.x, dot.y));
    }
    for (let mover of d.movers) {
        let newMover = new Mover(mover.x, mover.y, mover.w, mover.velX, mover.velY);
        newMover.move(dTime);
        gameData.movers.push(newMover);
    }
    for (let spawner of d.spawners) {
        let newS = new Spawner(spawner.x, spawner.y, spawner.w, spawner.rot, spawner.rotS, spawner.lastSpawn, spawner.spawnEvery);
        newS.update(dTime);
        gameData.spawners.push(newS);
    }
    for (let other of d.others) {
        let newP = new Player(other.name, other.x, other.y, other.speed, other.nutrition, other.layerWidth);
        newP.setVel(other.velX, other.velY);
        newP.move(dTime);
        gameData.others.push(newP);
    }
    justReceived = true;
    player.setNutrition(d.you.nutrition);
}

function draw() {
    background(0);
    if (state == NOT_CONNECTED) {
        textSize(50);
        fill(255);
        text("CONNECTING...", halfW, halfH);
    } else {
        if (socket.connected) {
            if (state == INGAME) {
                const now = Date.now();
                deltaTime = now - lastFrameTime;
                lastFrameTime = now;

                if (!justReceived) { //Update all moving objects
                    for (let other of gameData.others) {
                        other.move(deltaTime);
                    }
                    for (let mover of gameData.movers) {
                        mover.move(deltaTime);
                    }
                    for (let spawner of gameData.spawners) {
                        spawner.update(deltaTime);
                    }
                }

                player.updateVel();
                player.move(deltaTime);
                renderGame();

                const data = {
                    'x': player.pos.x,
                    'y': player.pos.y,
                    'vx': player.vel.x,
                    'vy': player.vel.y
                }
                socket.emit('pos', data);
                justReceived = false;
            }
        } else {
            console.log("Disconnected!");
            fill(255, 0, 0);
            textSize(50);
            text("DISCONNECTED", halfW, halfH);
            noLoop();
            alert("Disconnected from the server. Please refresh the page.");
            location.reload();
        }
    }
}

function renderGame() {
    push();
    noStroke();
    scl = map(player.r, baseSize, 100, 1, 2);
    translate(halfW, halfH);
    scale(1 / scl);

    const sclHalfW = halfW * scl;
    const sclHalfH = halfH * scl;

    for (let dot of gameData.dots) {
        let adjustedX = dot.pos.x - player.pos.x;
        let adjustedY = dot.pos.y - player.pos.y;
        if (adjustedX + dot.r > -sclHalfW && adjustedX - dot.r < sclHalfW && adjustedY + dot.r > -sclHalfH && adjustedY - dot.r < sclHalfH) { //Only draw things that are onscreen
            dot.show(adjustedX, adjustedY);
        }
    }
    for (let mover of gameData.movers) { //Draw the movers
        let adjustedX = mover.pos.x - player.pos.x;
        let adjustedY = mover.pos.y - player.pos.y;
        if (adjustedX + mover.halfW > -sclHalfW && adjustedX - mover.halfW < sclHalfW && adjustedY + mover.halfW > -sclHalfH && adjustedY - mover.halfW < sclHalfH) { //Only draw things that are onscreen
            mover.show(adjustedX, adjustedY);
        }
    }
    for (let spawner of gameData.spawners) { //Draw the spawners
        let adjustedX = spawner.pos.x - player.pos.x;
        let adjustedY = spawner.pos.y - player.pos.y;
        if (adjustedX + spawner.halfW > -sclHalfW && adjustedX - spawner.halfW < sclHalfW && adjustedY + spawner.halfW > -sclHalfH && adjustedY - spawner.halfW < sclHalfH) { //Only draw things that are onscreen
            spawner.show(adjustedX, adjustedY);
        }
    }
    for (let other of gameData.others) { //Draw the other players
        let adjustedX = other.pos.x - player.pos.x;
        let adjustedY = other.pos.y - player.pos.y;
        let adjustedR = baseSize + (other.layers * other.layerWidth);
        if (adjustedX + adjustedR > -sclHalfW && adjustedX - adjustedR < sclHalfW && adjustedY + adjustedR > -sclHalfH && adjustedY - adjustedR < sclHalfH) { //Only draw things that are onscreen
            other.show(adjustedX, adjustedY);
        }
        other.showName(adjustedX, adjustedY);
    }

    player.show(); //Draw the player
    player.showName();

    stroke(255);
    strokeWeight(4);
    line(-player.pos.x, -player.pos.y, -player.pos.x, gameDim.y - player.pos.y); //Left border
    line(gameDim.x - player.pos.x, -player.pos.y, gameDim.x - player.pos.x, gameDim.y - player.pos.y); //Right border

    line(-player.pos.x, -player.pos.y, gameDim.x - player.pos.x, -player.pos.y); //Top border
    line(-player.pos.x, gameDim.y - player.pos.y, gameDim.x - player.pos.x, gameDim.y - player.pos.y); //Botom border
    pop();

    //Show the leaderboard
    let leaderboard = [player, ...gameData.others].sort((a, b) => b.nutrition - a.nutrition); //The top scores
    let shownMe = false;
    push();
    textAlign(LEFT);
    fill(255);
    textSize(25);
    translate(0, 30);
    text("LEADERBOARD", 10, 0);
    textSize(20);
    for (let i = 0; i < min(3, leaderboard.length); i++) {
        if (!shownMe && leaderboard[i].nutrition == player.nutrition && leaderboard[i].name == player.name) {
            fill(255, 0, 0);
            shownMe = true;
        }
        text(`${i + 1}. ${leaderboard[i].name}:${leaderboard[i].nutrition}`, 10, 23);
        if (shownMe) fill(255);
        translate(0, 20);
    }

    if (!shownMe) {
        const myIndex = leaderboard.indexOf(player);
        fill(255, 0, 0);
        text(`${myIndex + 1}. ${leaderboard[myIndex].name}:${leaderboard[myIndex].nutrition}`, 10, 23);
    }
    pop();
}

function keyPressed() {
    if (state == INGAME && key == ' ') {
        socket.emit('shoot');
    }
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    halfW = width * 0.5;
    halfH = height * 0.5;
}