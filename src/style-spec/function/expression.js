// @flow

const {
    NullType,
    StringType,
    NumberType,
    BooleanType,
    ObjectType,
    ValueType,
    array
} = require('./types');

import type { Type, PrimitiveType, ArrayType, LambdaType } from './types.js';
import type { ExpressionName } from './expression_name.js';
export type Expression = LambdaExpression | LiteralExpression; // eslint-disable-line no-use-before-define
export type CompiledExpression = {|
    result: 'success',
    js: string,
    type: Type,
    isFeatureConstant: boolean,
    isZoomConstant: boolean,
    expression: Expression,
    function?: Function
|}

import type Color from './color';
export type Value = null | string | boolean | number | Color | { [string]: Value } | Array<Value>

const primitiveTypes = {
    string: StringType,
    number: NumberType,
    boolean: BooleanType
};

class ParsingError extends Error {
    key: string;
    constructor(key: string, message: string) {
        super(message);
        this.key = key;
    }
}

class ParsingContext {
    key: string;
    path: Array<number>;
    ancestors: Array<string>;
    definitions: {[string]: Class<LambdaExpression>};
    constructor(definitions: *, path: * = [], ancestors: * = []) {
        this.definitions = definitions;
        this.path = path;
        this.key = path.join('.');
        this.ancestors = ancestors;
    }

    concat(index: number, expressionName: ?string) {
        return new ParsingContext(
            this.definitions,
            this.path.concat(index),
            expressionName ? this.ancestors.concat(expressionName) : this.ancestors
        );
    }
}

class BaseExpression {
    key: string;
    +type: Type;
    constructor(key: *, type: *) {
        this.key = key;
        (this: any).type = type;
    }

    compile(_: Array<CompiledExpression>): {js?: string, isFeatureConstant?: boolean, isZoomConstant?: boolean, errors?: Array<string>} {
        throw new Error('Unimplemented');
    }

    serialize(_: boolean): any {
        throw new Error('Unimplemented');
    }
}

class LiteralExpression extends BaseExpression {
    +value: Value;
    constructor(key: *, type: PrimitiveType | ArrayType, value: Value) {
        super(key, type);
        (this: any).value = value;
    }

    compile() { throw new Error('Unimplemented'); }
}

class PrimitiveLiteral extends LiteralExpression {
    type: PrimitiveType;
    value: null | string | number | boolean;
    constructor(
        key: *,
        type: PrimitiveType,
        value: null | string | number | boolean
    ) {
        super(key, type, value);
    }

    static parse(value: any, context: ParsingContext) {
        const type = value === null ? NullType : primitiveTypes[typeof value];
        return new this(context.key, type, value);
    }

    compile() {
        return {js: JSON.stringify(this.value)};
    }

    serialize(_: boolean) {
        return this.value;
    }
}

class ArrayLiteral extends LiteralExpression {
    type: ArrayType;
    value: Array<Value>;
    constructor(key: *, type: ArrayType, value: Array<Value>) {
        super(key, type, value);
    }

    static inferArrayType(value: Array<Value>) {
        let itemType;
        // infer the array's item type
        for (const item of value) {
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

        return array(itemType || ValueType, value.length);
    }

    static parse(value: Array<any>, context: ParsingContext) {
        const arrayType = this.inferArrayType(value);
        return new this(
            context.key,
            arrayType,
            value
        );
    }

    compile() { return { js: `(${JSON.stringify(this.value)})` }; }
    serialize() { return ['literal', this.value]; }
}

class ObjectLiteral extends LiteralExpression {
    value: {[string]: Value};
    constructor(key: *, value: {[string]: Value}) {
        super(key, ObjectType, value);
    }

    static parse(value: {}, context: ParsingContext) {
        return new this(context.key, value);
    }

    compile() { return { js: `(${JSON.stringify(this.value)})` }; }

    serialize() { return ['literal', this.value]; }
}

class LambdaExpression extends BaseExpression {
    args: Array<Expression>;
    type: LambdaType;
    constructor(key: *, type: LambdaType, args: Array<Expression>) {
        super(key, type);
        this.args = args;
    }

    applyType(type: LambdaType, args: Array<Expression>): Expression {
        return new this.constructor(this.key, type, args);
    }

    serialize(withTypes: boolean) {
        const name = this.constructor.getName();
        const type = this.type.kind === 'lambda' ? this.type.result.name : this.type.name;
        const args = this.args.map(e => e.serialize(withTypes));
        return [ name + (withTypes ? `: ${type}` : '') ].concat(args);
    }

    // implemented by subclasses
    static getName(): ExpressionName { throw new Error('Unimplemented'); }
    static getType(): LambdaType { throw new Error('Unimplemented'); }

    // default parse; overridden by some subclasses
    static parse(args: Array<mixed>, context: ParsingContext): LambdaExpression {
        const op = this.getName();
        const parsedArgs: Array<Expression> = [];
        for (const arg of args) {
            parsedArgs.push(parseExpression(arg, context.concat(1 + parsedArgs.length, op)));
        }

        return new this(context.key, this.getType(), parsedArgs);
    }
}

function parseExpression(expr: mixed, context: ParsingContext) : Expression {
    const key = context.key;
    if (expr === null || typeof expr === 'undefined')
        return PrimitiveLiteral.parse(expr, context);

    if (primitiveTypes[typeof expr])
        return PrimitiveLiteral.parse(expr, context);

    if (!Array.isArray(expr)) {
        throw new ParsingError(key, `Expected an array, but found ${typeof expr} instead.`);
    }

    const op = expr[0];
    if (typeof op !== 'string') {
        throw new ParsingError(`${key}.0`, `Expression name must be a string, but found ${typeof op} instead.`);
    }

    if (op === 'literal') {
        if (expr.length !== 2)
            throw new ParsingError(key, `'literal' expression requires exactly one argument, but found ${expr.length - 1} instead.`);
        const argcontext = context.concat(1, 'literal');
        if (Array.isArray(expr[1])) {
            return ArrayLiteral.parse(expr[1], argcontext);
        }
        if (expr[1] && typeof expr[1] === 'object') {
            return ObjectLiteral.parse(expr[1], argcontext);
        }

        throw new ParsingError(argcontext.key, `Expected argument to 'literal' to be an array or object, but found ${typeof expr[1]} instead.`);
    }

    const Expr = context.definitions[op];
    if (!Expr) {
        throw new ParsingError(`${key}.0`, `Unknown expression "${op}"`);
    }

    return Expr.parse(expr.slice(1), context);
}

module.exports = {
    ParsingContext,
    ParsingError,
    parseExpression,
    LiteralExpression,
    LambdaExpression,
    ArrayLiteral
};
