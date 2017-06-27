'use strict';

const parseColor = require('../util/parse_color');
const interpolate = require('../util/interpolate');
const interpolationFactor = require('./interpolation_factor');

class RuntimeError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ExpressionEvaluationError';
        this.message = message;
    }

    toJSON() {
        return `${this.name}: ${this.message}`;
    }
}

// don't call this 'assert' because build/min.test.js checks for 'assert('
// in the bundled code to verify that unassertify is working.
function ensure(condition, message) {
    if (!condition) throw new RuntimeError(message);
    return true;
}

module.exports = () => ({
    ensure: ensure,
    error: (msg) => ensure(false, msg),

    at: function (index, arrayOrVector) {
        ensure(index < arrayOrVector.items.length, `${arrayOrVector.type} index out of bounds: ${index} > ${arrayOrVector.items.length}.`);
        return arrayOrVector.items[index];
    },

    get: function (obj, key, name) {
        ensure(this.has(obj, key, name), `Property '${key}' not found in ${name || `object with keys: [${Object.keys(obj)}]`}`);
        const val = obj.value[key];

        if (Array.isArray(val)) return this.array('Array<Value>', val);
        if (val && typeof val === 'object') return this.object(val);
        return val;
    },

    has: function (obj, key, name) {
        ensure(obj, `Cannot get property ${key} from null object${name ? ` ${name}` : ''}.`);
        return this.as(obj, 'Object', name).value.hasOwnProperty(key);
    },

    typeOf: function (x) {
        if (x === null) return 'Null';
        else if (typeof x === 'object') return x.type;
        else return titlecase(typeof x);
    },

    // type assertion
    as: function (value, expectedType, name) {
        const type = this.typeOf(value);
        if (expectedType === 'Array') {
            ensure(type.startsWith('Array'), `Expected ${name || 'value'} to be an array, but found ${type} instead.`);
        } else {
            ensure(type === expectedType, `Expected ${name || 'value'} to be of type ${expectedType}, but found ${type} instead.`);
        }
        return value;
    },

    coalesce: function (...thunks) {
        while (true) {
            try {
                if (thunks.length === 0) return null;
                const result = (thunks.shift())();
                if (result !== null) return result;
            } catch (e) {
                if (thunks.length === 0) throw e;
            }
        }
    },

    parseColor: function (input) {
        const c = {
            type: 'Color',
            value: parseColor(input)
        };
        ensure(typeof c.value !== 'undefined', `Could not parse color from value '${input}'`);
        return c;
    },

    rgba: function (...components) {
        return {
            type: 'Color',
            value: [
                components[0] / 255,
                components[1] / 255,
                components[2] / 255,
                components.length > 3 ? components[3] : 1
            ]
        };
    },

    array: function(type, items) {
        return {type, items};
    },

    object: function(value) {
        return {type: 'Object', value};
    },

    toString: function(value) {
        const type = this.typeOf(value);
        ensure(value === null || /^(String|Number|Boolean)$/.test(type), `Expected a primitive value in ["string", ...], but found ${type} instead.`);
        return String(value);
    },

    toNumber: function(value) {
        const num = Number(value);
        ensure(!isNaN(num), `Could not convert ${JSON.stringify(this.unwrap(value))} to number.`);
        return num;
    },

    unwrap: function (maybeWrapped) {
        if (!maybeWrapped || typeof maybeWrapped !== 'object')
            return maybeWrapped;

        const type = maybeWrapped.type;
        if (type === 'Color' || type === 'Object') return maybeWrapped.value;
        else if (/Array<|Vector</.test(type)) return maybeWrapped.items;

        // this shouldn't happen; if it does, it's a bug rather than a runtime
        // expression evaluation error
        throw new Error(`Unknown type ${type}`);
    },

    evaluateCurve(input, stopInputs, stopOutputs, interpolation, resultType) {
        input = this.as(input, 'Number', 'curve input');

        const stopCount = stopInputs.length;
        if (stopInputs.length === 1) return stopOutputs[0]();
        if (input <= stopInputs[0]) return stopOutputs[0]();
        if (input >= stopInputs[stopCount - 1]) return stopOutputs[stopCount - 1]();

        const index = findStopLessThanOrEqualTo(stopInputs, input);

        if (interpolation.name === 'step') {
            return stopOutputs[index]();
        }

        let base = 1;
        if (interpolation.name === 'exponential') {
            base = interpolation.base;
        }
        const t = interpolationFactor(input, base, stopInputs[index], stopInputs[index + 1]);

        const outputLower = stopOutputs[index]();
        const outputUpper = stopOutputs[index + 1]();

        if (resultType === 'color') {
            return {
                type: 'Color',
                value: interpolate.color(outputLower.value, outputUpper.value, t)
            };
        }

        if (resultType === 'array') {
            return this.array(
                outputLower.type,
                interpolate.array(outputLower.items, outputUpper.items, t)
            );
        }

        return interpolate[resultType](outputLower, outputUpper, t);
    }
});

function titlecase (s) {
    return `${s.slice(0, 1).toUpperCase()}${s.slice(1)}`;
}

/**
 * Returns the index of the last stop <= input, or 0 if it doesn't exist.
 *
 * @private
 */
function findStopLessThanOrEqualTo(stops, input) {
    const n = stops.length;
    let lowerIndex = 0;
    let upperIndex = n - 1;
    let currentIndex = 0;
    let currentValue, upperValue;

    while (lowerIndex <= upperIndex) {
        currentIndex = Math.floor((lowerIndex + upperIndex) / 2);
        currentValue = stops[currentIndex];
        upperValue = stops[currentIndex + 1];
        if (input === currentValue || input > currentValue && input < upperValue) { // Search complete
            return currentIndex;
        } else if (currentValue < input) {
            lowerIndex = currentIndex + 1;
        } else if (currentValue > input) {
            upperIndex = currentIndex - 1;
        }
    }

    return Math.max(currentIndex - 1, 0);
}

