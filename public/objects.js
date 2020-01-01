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
        const newVel = this.vel.copy();
        newVel.setMag(this.speed * deltaTime);
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
        textSize(this.r);
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
    }

    move(deltaTime) {
        this.pos.add(this.vel.x * deltaTime, this.vel.y * deltaTime);
        this.pos.x = constrain(this.pos.x, this.r, gameDim.x - this.r);
        this.pos.y = constrain(this.pos.y, this.r, gameDim.y - this.r);
    }

    updateVel() {
        this.vel = createVector(mouseX - halfW, mouseY - halfH);
        if (this.vel.magSq() < 2250) { //The player moves slower if the mouse is near
            this.vel.setMag(this.vel.mag() / 150 * this.speed);
        } else {
            this.vel.setMag(this.speed);
        }


        let newPos = p5.Vector.add(this.pos, this.vel);
        newPos.x = constrain(newPos.x, this.r, gameDim.x - this.r);
        newPos.y = constrain(newPos.y, this.r, gameDim.y - this.r);

        let otherObjects = gameData.others.concat(gameData.spawners);

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
        this.move();
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