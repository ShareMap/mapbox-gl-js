'use strict';
// @flow

/*::
 export type PrimitiveType = { kind: 'primitive', name: string }
 export type TypeName = { kind: 'typename', name: string, typename: string }
 export type VariantType = { kind: 'variant', name: string, members: Array<Type> }
 export type ArrayType = { kind: 'array', name: string, itemType: Type, N: ?number }
 export type NArgs = { kind: 'nargs', name: string, types: Array<Type>, N: number }
 export type LambdaType = { kind: 'lambda', name: string, result: Type, params: Array<Type> }
 export type Type = PrimitiveType | TypeName | VariantType | ArrayType | NArgs | LambdaType
*/

function primitive(name) /*: PrimitiveType */ {
    return { kind: 'primitive', name };
}

function typename(tn: string)/*: TypeName */ {
    return { kind: 'typename', name: `typename ${tn}`, typename: tn };
}

// each 'types' argument may be either an object of type Type or a function
// accepting 'this' variant and returning a Type (the latter allowing
// recursive variant definitions)
function variant(...types: Array<Type | (Type)=>Type>) /*: VariantType */ {
    const v: Object = {
        kind: 'variant',
        name: '(recursive_wrapper)'
    };
    v.members = types.map(t => typeof t === 'function' ? t(v) : t);
    v.name = v.members.map(t => t.name).join(' | ');
    v.toJSON = function () { return this.name; };
    return v;
}

function array(itemType: Type, N: ?number) /*: ArrayType */ {
    return {
        kind: 'array',
        name: typeof N === 'number' ? `Array<${itemType.name}, ${N}>` : `Array<${itemType.name}>`,
        itemType,
        N
    };
}

function nargs(N: number, ...types: Array<Type>) /*: NArgs */ {
    return {
        kind: 'nargs',
        name: `${types.map(t => t.name).join(', ')}, ...`,
        types,
        N
    };
}

function lambda(result: Type, ...params: Array<Type>) /*: LambdaType */ {
    return {
        kind: 'lambda',
        name: `(${params.map(a => a.name).join(', ')}) => ${result.name}`,
        result,
        params
    };
}

const NullType = primitive('Null');
const NumberType = primitive('Number');
const StringType = primitive('String');
const BooleanType = primitive('Boolean');
const ColorType = primitive('Color');
const ObjectType = primitive('Object');

const ValueType = variant(
    NullType,
    NumberType,
    StringType,
    BooleanType,
    ObjectType,
    (Value: Type) => array(Value)
);

const InterpolationType = primitive('interpolation_type');

module.exports = {
    NullType,
    NumberType,
    StringType,
    BooleanType,
    ColorType,
    ObjectType,
    ValueType,
    InterpolationType,
    typename,
    variant,
    array,
    lambda,
    nargs
};
