'use strict';

// @flow

const {
    NullType,
    NumberType,
    StringType,
    BooleanType,
    ValueType,
    ObjectType,
    array
} = require('./types');

/*::
 import type { TypeError, TypedExpression } from './type_check.js';

 import type { ExpressionName } from './expression_name.js';

 import type { Definition } from './expressions.js';

 export type ParseError = {|
     error: string,
     key: string
 |}
*/

module.exports = parseExpression;

const primitiveTypes = {
    string: StringType,
    number: NumberType,
    boolean: BooleanType
};

/**
 * Parse raw JSON expression into a TypedExpression structure, with type
 * tags taken directly from the definition of each function (i.e.,
 * no inference performed).
 *
 * @private
 */
function parseExpression(
    definitions: {[string]: Definition},
    expr: mixed,
    path: Array<number> = [],
    ancestorNames: Array<string> = []
) /*: TypedExpression | ParseError */ {
    const key = path.join('.');
    if (expr === null || typeof expr === 'undefined') return {
        literal: true,
        value: null,
        type: NullType,
        key
    };

    if (primitiveTypes[typeof expr]) return {
        literal: true,
        value: expr,
        type: primitiveTypes[typeof expr],
        key
    };

    if (!Array.isArray(expr)) {
        return {
            key,
            error: `Expected an array, but found ${typeof expr} instead.`
        };
    }

    if (expr[0] === 'literal') {
        if (expr.length !== 2) return {
            key,
            error: `'literal' expression requires exactly one argument, but found ${expr.length - 1} instead.`
        };

        const rawValue = expr[1];
        let type;
        let value;
        if (Array.isArray(rawValue)) {
            let itemType;
            // infer the array's item type
            for (const item of rawValue) {
                const t = primitiveTypes[typeof item];
                if (t && !itemType) {
                    itemType = t;
                } else if (t && itemType === t) {
                    continue;
                } else {
                    itemType = ValueType;
                    break;
                }
            }

            type = array(itemType || ValueType, rawValue.length);
            value = { type: type.name, items: rawValue };
        } else {
            type = ObjectType;
            value = { type: 'Object', value: rawValue };
        }

        return {
            literal: true,
            value,
            type,
            key
        };
    }

    const op = expr[0];
    if (typeof op !== 'string') {
        return {
            key: `${key}.0`,
            error: `Expression name must be a string, but found ${typeof op} instead.`
        };
    }

    const definition = definitions[op];
    if (!definition) {
        return {
            key,
            error: `Unknown function ${op}`
        };
    }

    // special case validation for `zoom`
    if (op === 'zoom') {
        const ancestors = ancestorNames.join(':');
        // zoom expressions may only appear like:
        // ['curve', interp, ['zoom'], ...]
        // or ['coalesce', ['curve', interp, ['zoom'], ...], ... ]
        if (
            !/^(1.)?2/.test(key) ||
            !/(coalesce:)?curve/.test(ancestors)
        ) {
            return {
                key,
                error: 'The "zoom" expression may only be used as the input to a top-level "curve" expression.'
            };
        }
    }

    // special case parsing for `match`
    if (op === 'match') {
        if (expr.length < 3) return {
            key,
            error: `Expected at least 2 arguments, but found only ${expr.length - 1}.`
        };

        const inputExpression = parseExpression(definitions, expr[1], path.concat(1), ancestorNames.concat(op));
        if (inputExpression.error) return inputExpression;

        // parse input/output pairs.
        const matchInputs = [];
        const outputExpressions = [];
        for (let i = 2; i < expr.length - 2; i += 2) {
            const inputGroup = Array.isArray(expr[i]) ? expr[i] : [expr[i]];
            if (inputGroup.length === 0) {
                return {
                    key: `${key}.${i}`,
                    error: 'Expected at least one input value.'
                };
            }

            const parsedInputGroup = [];
            for (let j = 0; j < inputGroup.length; j++) {
                const parsedValue = parseExpression(definitions, inputGroup[j], path.concat(i, j), ancestorNames.concat(op));
                if (parsedValue.error) return parsedValue;
                if (!parsedValue.literal) return {
                    key: `${key}.${i}.${j}`,
                    error: 'Match inputs must be literal primitive values or arrays of literal primitive values.'
                };
                parsedInputGroup.push(parsedValue);
            }
            matchInputs.push(parsedInputGroup);

            const output = parseExpression(definitions, expr[i + 1], path.concat(i), ancestorNames.concat(op));
            if (output.error) return output;
            outputExpressions.push(output);
        }

        const otherwise = parseExpression(definitions, expr[expr.length - 1], path.concat(expr.length - 1), ancestorNames.concat(op));
        if (otherwise.error) return otherwise;
        outputExpressions.push(otherwise);

        return {
            literal: false,
            name: 'match',
            type: definition.type,
            matchInputs,
            arguments: [inputExpression].concat(outputExpressions),
            key
        };
    }

    const args = [];
    for (const arg of expr.slice(1)) {
        const parsedArg = parseExpression(definitions, arg, path.concat(1 + args.length), ancestorNames.concat(op));
        if (parsedArg.error) return parsedArg;
        args.push(parsedArg);
    }

    return {
        literal: false,
        name: op,
        type: definition.type,
        arguments: args,
        key
    };
}
