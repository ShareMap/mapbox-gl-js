// @flow

module.exports = class Color {
    value: [number, number, number, number];
    constructor(r: number, g: number, b: number, a: number = 1) {
        this.value = [r, g, b, a];
    }
};
