// @flow

const {
    NullType,
    StringType,
    NumberType,
    BooleanType
} = require('./types');

const {Color, isValue, typeOf} = require('./values');

import type { Value }  from './values';
import type { Type, LambdaType } from './types';
import type { ExpressionName } from './expression_name';

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
    value: Value;

    constructor(key: *, type: Type, value: Value) {
        super(key, type);
        this.value = value;
    }

    static parse(args: Array<mixed>, context: ParsingContext) {
        if (args.length !== 1)
            throw new ParsingError(context.key, `'literal' expression requires exactly one argument, but found ${args.length} instead.`);

        if (!isValue(args[0]))
            throw new ParsingError(context.key, `invalid value`);

        const value = (args[0] : any);
        const type = typeOf(value);

        return new this(context.key, type, value);
    }

    compile() { return { js: JSON.stringify(this.value)}; }

    serialize(_: boolean) {
        if (this.value === null || typeof this.value === 'string' || typeof this.value === 'boolean' || typeof this.value === 'number') {
            return this.value;
        } else if (this.value instanceof Color) {
            return ["rgba"].concat(this.value.value);
        } else {
            return ["literal", this.value];
        }
    }
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

    if (expr === null) {
        return new LiteralExpression(key, NullType, expr);
    } else if (typeof expr === 'undefined') {
        throw new ParsingError(key, `'undefined' value invalid. Use null instead.`);
    } else if (typeof expr === 'string') {
        return new LiteralExpression(key, StringType, expr);
    } else if (typeof expr === 'boolean') {
        return new LiteralExpression(key, BooleanType, expr);
    } else if (typeof expr === 'number') {
        return new LiteralExpression(key, NumberType, expr);
    } else if (Array.isArray(expr)) {
        if (expr.length === 0) {
            throw new ParsingError(key, `Expected an array with at least one element. If you wanted a literal array, use ["literal", []].`);
        }

        const op = expr[0];
        if (typeof op !== 'string') {
            throw new ParsingError(`${key}.0`, `Expression name must be a string, but found ${typeof op} instead. If you wanted a literal array, use ["literal", [...]].`);
        }

        if (op === 'literal') {
            return LiteralExpression.parse(expr.slice(1), context);
        }

        const Expr = context.definitions[op];
        if (!Expr) {
            throw new ParsingError(`${key}.0`, `Unknown expression "${op}". If you wanted a literal array, use ["literal", [...]].`);
        }

        return Expr.parse(expr.slice(1), context);
    } else if (typeof expr === 'object') {
        throw new ParsingError(key, `Bare objects invalid. Use ["literal", {...}] instead.`);
    } else {
        throw new ParsingError(key, `Expected an array, but found ${typeof expr} instead.`);
    }
}

module.exports = {
    ParsingContext,
    ParsingError,
    parseExpression,
    LiteralExpression,
    LambdaExpression
};
