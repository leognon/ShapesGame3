new p5(() => {
    let socket;

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

    setup = () => {
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
                socket.emit('joinGame', {
                    'name': nameInp.value(),
                    'canvasW': width,
                    'canvasH': height
                });
            }
        });


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
            gameData.movers.push(newMover);
        }
        for (let spawner of d.spawners) {
            let newS = new Spawner(spawner.x, spawner.y, spawner.w, spawner.rot, spawner.rotS, spawner.lastSpawn, spawner.spawnEvery);
            gameData.spawners.push(newS);
        }
        for (let other of d.others) {
            let newP = new Player(other.name, other.x, other.y, other.speed, other.nutrition, other.layerWidth);
            newP.setVel(other.velX, other.velY);
            gameData.others.push(newP);
        }
        justReceived = true;
        player.setNutrition(d.you.nutrition);
    }

    draw = () => {
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

                    player.setVel(mouseX - halfW, mouseY - halfH);
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

    keyPressed = () => {
        if (state == INGAME && key == ' ') {
            const angle = createVector(mouseX - halfW, mouseY - halfH).heading();
            socket.emit('shoot', angle);
        }
    }

    windowResized = () => {
        resizeCanvas(windowWidth, windowHeight);
        halfW = width * 0.5;
        halfH = height * 0.5;
        socket.emit('canvasSize', {
            'canvasW': width,
            'canvasH': height
        });
    }

    class Square {
        constructor(x, y, w, rot = 0) {
            this.pos = createVector(x, y);
            this.w = w;
            this.halfW = w * 0.5;
            this.r = this.halfW;
            this.rot = rot;
        }

        show(adjustedX, adjustedY, extra) {
            push();
            translate(adjustedX, adjustedY);
            rotate(this.rot);
            fill(255, 0, 0);
            rect(-this.halfW, -this.halfW, this.w, this.w);
            if (extra) extra();
            pop();
        }

        getCorners() {
            return [
                createVector(this.halfW, this.halfW).rotate(this.rot).add(this.pos),
                createVector(-this.halfW, this.halfW).rotate(this.rot).add(this.pos),
                createVector(this.halfW, -this.halfW).rotate(this.rot).add(this.pos),
                createVector(-this.halfW, -this.halfW).rotate(this.rot).add(this.pos)
            ];
        }
    }

    class Spawner extends Square {
        constructor(x, y, w, rot, rotS, lastSpawn, spawnEvery) {
            super(x, y, w, rot);
            this.rotSpeed = rotS;
            this.lastSpawn = lastSpawn;
            this.nextSpawn = lastSpawn + spawnEvery;
            this.ringSpacing = 15;
            // this.spawnEvery = spawnEvery;
        }

        show(adjustedX, adjustedY) {
            super.show(adjustedX, adjustedY, () => {
                const ringW = this.w * (Date.now() - this.lastSpawn) / (this.nextSpawn - this.lastSpawn);
                rectMode(CENTER);
                noFill();
                stroke(0, 255, 0);
                strokeWeight(3);
                for (let w = ringW; w >= 0; w -= this.ringSpacing) {
                    rect(0, 0, w, w);
                }
                line(0, 0, ringW / 2, 0);
            });
        }

        update(dTime) {
            this.rot += (this.rotSpeed * dTime);
        }
    }

    class Mover extends Square {
        constructor(x, y, w, vx, vy) {
            super(x, y, w, 0);
            this.vel = createVector(vx, vy);
            this.rot = this.vel.heading();
            this.speed = this.vel.mag();
        }

        move(deltaTime) {
            for (let dt = min(250, deltaTime); dt <= deltaTime; dt += 250) { //If the deltaTime is too big, it will do the collsiion in steps of 500ms
            const newVel = this.vel.copy();
                newVel.setMag(this.speed * dt);
            this.pos.add(newVel);
            const corners = this.getCorners();

            let bounceX = false;
            let bounceY = false;

            for (let corner of corners) {
                if (corner.x < 0 || corner.x > gameDim.x) bounceX = true;
                if (corner.y < 0 || corner.y > gameDim.y) bounceY = true;
            }

            if (bounceX) {
                this.vel.x *= -1;
                this.rot = Math.atan2(this.vel.y, this.vel.x);
            }
            if (bounceY) {
                this.vel.y *= -1;
                this.rot = Math.atan2(this.vel.y, this.vel.x);
            }
        }
    }
    }

    class Circle {
        constructor(x, y, r) {
            this.pos = createVector(x, y);
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

        hitCircle(otherPos, otherR, thisPos = this.pos) {
            const xDist = Math.pow(thisPos.x - otherPos.x, 2);
            const yDist = Math.pow(thisPos.y - otherPos.y, 2);
            return (xDist + yDist < sq(otherR + this.r));
        }
    }

    class Player extends Circle {
        constructor(name, x, y, s, nutrition = 0, layerWidth = 5) {
            super(x, y, 17); //The r is defaulted to 17, but will be correctly set later

            this.name = name;

            this.baseSize = baseSize;
            this.layerWidth = layerWidth;
            this.nutritionPerLayer = 12;
            this.maxLayers = Math.floor(((Math.min(gameDim.x, gameDim.y) * 0.5) - this.baseSize) / this.layerWidth); //The maximum amount of layers being bigger than the arena
            this.setNutrition(nutrition);

            this.speed = s;
            this.speedSq = this.speed * this.speed;
            this.vel = createVector();
        }

        show(adjustedX = 0, adjustedY = 0) {
            push();
            colorMode(HSB); //For rainbow colors
            for (let i = this.layers; i >= 0; i--) {
                const r = this.baseSize + (i * this.layerWidth);
                fill((i * 137) % 360, 100, 100);
                ellipse(adjustedX, adjustedY, r * 2);
            }
            fill(255);
            ellipse(adjustedX, adjustedY, this.baseSize * 2);
            pop();
        }

        showName(adjustedX = 0, adjustedY = 0) {
            fill(255);
            noStroke();
            textSize(this.r * 0.7);
            textAlign(CENTER);
            text(this.name, adjustedX, adjustedY - (5 + this.baseSize + (this.layers * this.layerWidth)));
        }

        setNutrition(nutrition) {
            this.nutrition = nutrition;
            this.layers = Math.floor(this.nutrition / this.nutritionPerLayer);

            if (this.layers > this.maxLayers) this.layers = this.maxLayers;
            this.r = baseSize + (this.layers * this.layerWidth);

            this.pos.x = constrain(this.pos.x, this.r, gameDim.x - this.r);
            this.pos.y = constrain(this.pos.y, this.r, gameDim.y - this.r);
        }

        setVel(x, y) {
            this.vel.set(x, y);
            this.correctVel();
        }

        move(deltaTime) {
            this.pos.add(this.vel.x * deltaTime, this.vel.y * deltaTime);
            this.pos.x = constrain(this.pos.x, this.r, gameDim.x - this.r);
            this.pos.y = constrain(this.pos.y, this.r, gameDim.y - this.r);
        }

        correctVel() {
            if (this.vel.magSq() < 2250) { //The player moves slower if the mouse is near
                this.vel.setMag(this.vel.mag() / 150 * this.speed);
            } else {
                this.vel.setMag(this.speed);
            }

            let newPos = p5.Vector.add(this.pos, this.vel);
            newPos.x = constrain(newPos.x, this.r, gameDim.x - this.r);
            newPos.y = constrain(newPos.y, this.r, gameDim.y - this.r);

            let otherObjects = [...gameData.spawners];
            for (let other of gameData.others) {
                if (other !== this) otherObjects.push(other);
            }
            if (player !== this) otherObjects.push(player);

            let firstCollision = false;
            for (let other of otherObjects) {
                if (this.hitCircle(other.pos, other.r, newPos)) { //The algorithm that determines a new velocity to cause the player to curve around other players if trying to move into them
                    if (!firstCollision) {
                        firstCollision = true;

                        const tanVec = p5.Vector.sub(other.pos, this.pos).rotate(HALF_PI); //A vec tangent to the other circle
                        const tanM = tanVec.y / tanVec.x; //The slope of the tan vec
                        const tanB = this.pos.y - (tanM * this.pos.x); //The y-int of the tan vec (passes through the center of this)

                        let firstAng = (this.vel.heading() - tanVec.heading()); //Used for determining the reference angle
                        if (firstAng < 0) firstAng += TWO_PI; //Coterminal angle
                        let secondAng = PI - firstAng; //If it's in the second quadrant
                        const refAng = Math.min(firstAng, secondAng); //The reference angle from the desired vel (mouse) to the tan
                        if (refAng < 0) { //If the player is trying to move towards the other player, adjust the velocity
                            const towardsDesVec = p5.Vector.sub(newPos, other.pos); //The vector pointing from the other player to this desired position
                            const towardsM = towardsDesVec.y / towardsDesVec.x; //The slope of that vector
                            const towardsB = other.pos.y - (towardsM * other.pos.x); //The y-int of that vector, so that it passes through the other players center

                            let intersectX = (towardsB - tanB) / (tanM - towardsM); //The intersection of the 2 lines
                            let intersectY = (towardsM * intersectX) + towardsB;
                            if (intersectX < this.r || intersectX > gameDim.x - this.r || intersectY < this.r || intersectY > gameDim.y - this.r) {
                                this.vel.mult(0);
                            } else {
                                this.vel.set(intersectX - this.pos.x, intersectY - this.pos.y); //The new vel is the vector pointing from this to that intersection
                            }
                            newPos = p5.Vector.add(this.pos, this.vel); //Update the new position for other collisions
                        }
                    } else {
                        this.vel.mult(0); //If trying to move into multiple other players, just don't move at all
                    }
                }
            }
        }
    }

    class Dot extends Circle {
        constructor(x, y) {
            super(x, y, 3);
            this.nutrition = 1;
        }

        show(adjustedX, adjustedY) {
            fill(random(127, 255), random(127, 255), random(127, 255)); //Make the dots flash random colors
            ellipse(adjustedX, adjustedY, this.r * 2);
        }
    }
});
setTimeout(() => {
    document.getElementById("defaultCanvas1").parentElement.removeChild(document.getElementById("defaultCanvas1")); //Delete the extra canvas
}, 1000);