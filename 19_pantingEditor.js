import { elt } from "./19_buildDomFn.js";

export {
    Picture as Picture,
    updateState as updateState,
    PixelEditor as PixelEditor,
    ToolSelect as ToolSelect,
    ColorSelect as ColorSelect,
    draw, fill, rectangle, circle, line, pick,
    SaveButton, LoadButton, UndoButton, historyUpdateState
}
class Picture {
    constructor(width, height, pixels) {
        this.width = width;
        this.height = height;
        this.pixels = pixels;
    }
    static empty(width, height, color) {
        let pixels = new Array(width * height).fill(color);
        return new Picture(width, height, pixels);
    }
    pixel(x, y) {
        return this.pixels[x + y * this.width];
    }
    draw(pixels) {
        let copy = this.pixels.slice();
        for (let { x, y, color } of pixels) {
            copy[x + y * this.width] = color;
        }
        return new Picture(this.width, this.height, copy);
    }
}

function updateState(state, action) {
    // return Object.assign({}, state, action);
    // triple-dot operator, pread operator
    return { ...state, ...action };
}

const scale = 10;

class PictureCanvas {
    constructor(picture, pointerDown) {
        this.dom = elt("canvas", {
            onmousedown: event => this.mouse(event, pointerDown),
            ontouchstart: event => this.touch(event, pointerDown)
        });
        this.syncState(picture);
    }
    syncState(picture) {
        if (this.picture == picture) return;
        drawPicture(picture, this.dom, scale, this.picture);
        this.picture = picture;
    }
}

function drawPicture(picture, canvas, scale, oldPicture) {
    if (!oldPicture ||
        picture.height != oldPicture.height ||
        picture.width != oldPicture.width) {
        canvas.width = picture.width * scale;
        canvas.height = picture.height * scale;
        oldPicture = undefined;
    }
    let cx = canvas.getContext("2d");

    if (!oldPicture) {
        for (let y = 0; y < picture.height; y++) {
            for (let x = 0; x < picture.width; x++) {
                cx.fillStyle = picture.pixel(x, y);
                cx.fillRect(x * scale, y * scale, scale, scale);
            }
        }
    } else {
        for (let y = 0; y < picture.height; y++) {
            for (let x = 0; x < picture.width; x++) {
                if (picture.pixel(x, y) !== oldPicture.pixel(x, y)) {
                    cx.fillStyle = picture.pixel(x, y);
                    cx.fillRect(x * scale, y * scale, scale, scale);
                }
            }
        }
    }
}

PictureCanvas.prototype.mouse = function (downEvent, onDown) {
    if (downEvent.button != 0) return;
    let pos = pointerPosition(downEvent, this.dom);
    let onMove = onDown(pos);
    if (!onMove) return;
    let move = moveEvent => {
        if (moveEvent.buttons == 0) {
            this.dom.removeEventListener("mousemove", move);
        } else {
            let newPos = pointerPosition(moveEvent, this.dom);
            if (newPos.x == pos.x && newPos.y == pos.y) return;
            pos = newPos;
            onMove(newPos);
        }
    };
    this.dom.addEventListener("mousemove", move);
};

function pointerPosition(pos, domNode) {
    let rect = domNode.getBoundingClientRect();
    return {
        x: Math.floor((pos.clientX - rect.left) / scale),
        y: Math.floor((pos.clientY - rect.top) / scale)
    };
}

PictureCanvas.prototype.touch = function (startEvent, onDown) {
    let pos = pointerPosition(startEvent.touches[0], this.dom);
    let onMove = onDown(pos);
    startEvent.preventDefault();
    if (!onMove) return;
    let move = moveEvent => {
        let newPos = pointerPosition(moveEvent.touches[0],
            this.dom);
        if (newPos.x == pos.x && newPos.y == pos.y) return;
        pos = newPos;
        onMove(newPos);
    };
    let end = () => {
        this.dom.removeEventListener("touchmove", move);
        this.dom.removeEventListener("touchend", end);
    };
    this.dom.addEventListener("touchmove", move);
    this.dom.addEventListener("touchend", end);
};

class PixelEditor {
    constructor(state, config) {
        let { tools, controls, dispatch } = config;
        this.state = state;

        this.canvas = new PictureCanvas(state.picture, pos => {
            let tool = tools[this.state.tool];
            let onMove = tool(pos, this.state, dispatch);
            if (onMove) return pos => onMove(pos, this.state);
        });
        this.controls = controls.map(
            Control => new Control(state, config));
        this.dom = elt("div", {
            tabIndex: 0,
            onkeydown: event => this.keyDown(event, config)
        }, this.canvas.dom, elt("br"),
            ...this.controls.reduce((a, c) => a.concat(" ", c.dom), []));
    }
    keyDown(event, config) {
        if (event.key == "z" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            config.dispatch({ undo: true });
        } else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
            for (let tool of Object.keys(config.tools)) {
                if (tool[0] == event.key) {
                    event.preventDefault();
                    config.dispatch({ tool });
                    return;
                }
            }
        }
    }
    syncState(state) {
        this.state = state;
        this.canvas.syncState(state.picture);
        for (let ctrl of this.controls) ctrl.syncState(state);
    }
}

class ToolSelect {
    constructor(state, { tools, dispatch }) {
        this.select = elt("select", {
            onchange: () => dispatch({ tool: this.select.value })
        }, ...Object.keys(tools).map(name => elt("option", {
            selected: name == state.tool
        }, name)));
        this.dom = elt("label", null, "🖌 Tool: ", this.select);
    }
    syncState(state) { this.select.value = state.tool; }
}

class ColorSelect {
    constructor(state, { dispatch }) {
        this.input = elt("input", {
            type: "color",
            value: state.color,
            onchange: () => dispatch({ color: this.input.value })
        });
        this.dom = elt("label", null, "🎨 Color: ", this.input);
    }
    syncState(state) { this.input.value = state.color; }
}

function draw(pos, state, dispatch) {
    function drawPixel({ x, y }, state) {
        let drawn = { x, y, color: state.color };
        dispatch({ picture: state.picture.draw([drawn]) });
    }
    drawPixel(pos, state);
    return drawPixel;
}

function line(pos, state, dispatch) {
    let lastPos = pos;
    function drawLine({ x, y }, state) {
        if (x === lastPos.x && y === lastPos.y) return;
        const xToX = x - lastPos.y;
        const yToY = y - lastPos.y;
        let drawn = [];
        if (xToX - yToY > 0) {
            const disY = Math.ceil(xToX/yToY);
            const xThanPosX = x > lastPos.x;
            const yPlus = y > lastPos.y;
            let currentY = y;
            let yReacted = 0;
            for (let dx = lastPos.x; dx !== x; xThanPosX ? dx++ : dx--) {
                yReacted++;
                if (yReacted === disY) {
                    yReacted = 0;
                    yPlus ? ++currentY : --currentY;
                }
                drawn.push({ x: dx, y: currentY, color: state.color })
            }
        } else {
            const disX = Math.ceil(yToY/xToX);
            const yThanPosY = y > lastPos.y;
            const xPlus = x > lastPos.x;
            let currentX = x;
            let xReacted = 0;
            for (let dy = lastPos.y; dy !== y; yThanPosY ? dy++ : dy--) {
                xReacted++;
                if (xReacted === disX) {
                    xReacted = 0;
                    xPlus ? ++currentX : --currentX;
                }
                drawn.push({ x: currentX, y: dy, color: state.color })
            }
        }
        dispatch({ picture: state.picture.draw(drawn) });
        // saving last pos
        lastPos.x = x;
        lastPos.y = y;
    }
    drawLine(pos, state);
    return drawLine;
}

function rectangle(start, state, dispatch) {
    function drawRectangle(pos) {
        let xStart = Math.min(start.x, pos.x);
        let yStart = Math.min(start.y, pos.y);
        let xEnd = Math.max(start.x, pos.x);
        let yEnd = Math.max(start.y, pos.y);
        let drawn = [];
        for (let y = yStart; y <= yEnd; y++) {
            for (let x = xStart; x <= xEnd; x++) {
                drawn.push({ x, y, color: state.color });
            }
        }
        dispatch({ picture: state.picture.draw(drawn) });
    }
    drawRectangle(start);
    return drawRectangle;
}

function circle(pos, state, dispatch) {
    function drawCircle(to) {
        let radius = Math.sqrt(Math.pow(to.x - pos.x, 2) +
            Math.pow(to.y - pos.y, 2));
        let radiusC = Math.ceil(radius);
        let drawn = [];
        for (let dy = -radiusC; dy <= radiusC; dy++) {
            for (let dx = -radiusC; dx <= radiusC; dx++) {
                let dist = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
                if (dist > radius) continue;
                let y = pos.y + dy, x = pos.x + dx;
                if (y < 0 || y >= state.picture.height ||
                    x < 0 || x >= state.picture.width) continue;
                drawn.push({ x, y, color: state.color });
            }
        }
        dispatch({ picture: state.picture.draw(drawn) });
    }
    drawCircle(pos);
    return drawCircle;
}

const around = [{ dx: -1, dy: 0 }, { dx: 1, dy: 0 },
{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }];

function fill({ x, y }, state, dispatch) {
    let targetColor = state.picture.pixel(x, y);
    let drawn = [{ x, y, color: state.color }];
    for (let done = 0; done < drawn.length; done++) {
        for (let { dx, dy } of around) {
            let x = drawn[done].x + dx, y = drawn[done].y + dy;
            if (x >= 0 && x < state.picture.width &&
                y >= 0 && y < state.picture.height &&
                state.picture.pixel(x, y) == targetColor &&
                !drawn.some(p => p.x == x && p.y == y)) {
                drawn.push({ x, y, color: state.color });
            }
        }
    }
    dispatch({ picture: state.picture.draw(drawn) });
}

function pick(pos, state, dispatch) {
    dispatch({ color: state.picture.pixel(pos.x, pos.y) });
}

class SaveButton {
    constructor(state) {
        this.picture = state.picture;
        this.dom = elt("button", {
            onclick: () => this.save()
        }, "💾 Save");
    }
    save() {
        let canvas = elt("canvas");
        drawPicture(this.picture, canvas, 1);
        let link = elt("a", {
            href: canvas.toDataURL(),
            download: "pixelart.png"
        });
        document.body.appendChild(link);
        link.click();
        link.remove();
    }
    syncState(state) { this.picture = state.picture; }
}

class LoadButton {
    constructor(_, { dispatch }) {
        this.dom = elt("button", {
            onclick: () => startLoad(dispatch)
        }, "📁 Load");
    }
    syncState() { }
}

function startLoad(dispatch) {
    let input = elt("input", {
        type: "file",
        onchange: () => finishLoad(input.files[0], dispatch)
    });
    document.body.appendChild(input);
    input.click();
    input.remove();
}

function finishLoad(file, dispatch) {
    if (file == null) return;
    let reader = new FileReader();
    reader.addEventListener("load", () => {
        let image = elt("img", {
            onload: () => dispatch({
                picture: pictureFromImage(image)
            }),
            src: reader.result
        });
    });
    reader.readAsDataURL(file);
}

function pictureFromImage(image) {
    let width = Math.min(100, image.width);
    let height = Math.min(100, image.height);
    let canvas = elt("canvas", { width, height });
    let cx = canvas.getContext("2d");
    cx.drawImage(image, 0, 0);
    let pixels = [];
    let { data } = cx.getImageData(0, 0, width, height);

    function hex(n) {
        return n.toString(16).padStart(2, "0");
    }
    for (let i = 0; i < data.length; i += 4) {
        let [r, g, b] = data.slice(i, i + 3);
        pixels.push("#" + hex(r) + hex(g) + hex(b));
    }
    return new Picture(width, height, pixels);
}

function historyUpdateState(state, action) {
    if (action.undo == true) {
        if (state.done.length == 0) return state;
        return Object.assign({}, state, {
            picture: state.done[0],
            done: state.done.slice(1),
            doneAt: 0
        });
    } else if (action.picture &&
        state.doneAt < Date.now() - 1000) {
        return Object.assign({}, state, action, {
            done: [state.picture, ...state.done],
            doneAt: Date.now()
        });
    } else {
        return Object.assign({}, state, action);
    }
}


class UndoButton {
    constructor(state, { dispatch }) {
        this.dom = elt("button", {
            onclick: () => dispatch({ undo: true }),
            disabled: state.done.length == 0
        }, "⮪ Undo");
    }
    syncState(state) {
        this.dom.disabled = state.done.length == 0;
    }
}