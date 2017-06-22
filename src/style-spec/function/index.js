
const compileExpression = require('./compile');
const convert = require('./convert');
const {ColorType, StringType, NumberType, ValueType, array, vector} = require('./types');
const serialize = require('./type_check').serialize;

function createFunction(parameters, propertySpec) {
    let expr;
    if (!isFunctionDefinition(parameters)) {
        expr = convert.value(parameters, propertySpec);
    } else if (parameters.expression) {
        expr = parameters.expression;
        if (typeof propertySpec.default !== 'undefined') {
            const specDefault = convert.value(propertySpec.default);
            expr = ['coalesce', expr, specDefault];
        }
    } else {
        expr = convert.function(parameters, propertySpec);
    }

    const expectedType = getExpectedType(propertySpec);
    const compiled = compileExpression(expr, expectedType);
    if (compiled.result === 'success') {
        const f = function (zoom, properties) {
            const val = compiled.function({zoom}, {properties});
            return val === null ? undefined : val;
        };
        f.isFeatureConstant = compiled.isFeatureConstant;
        f.isZoomConstant = compiled.isZoomConstant;
        return f;
    } else {
        console.log(expr)
        throw new Error(compiled.errors.map(err => `${err.key}: ${err.error}`));
    }
}

module.exports = createFunction;
module.exports.isFunctionDefinition = isFunctionDefinition;

function isFunctionDefinition(value) {
    return typeof value === 'object' &&
        (value.expression || value.stops || value.type === 'identity');
}

function getExpectedType(spec) {
    const types = {
        color: ColorType,
        string: StringType,
        number: NumberType,
        enum: StringType,
        image: StringType
    };

    if (spec.type === 'array') {
        if (typeof spec.length === 'number')
            return array(types[spec.value], spec.length);
        else
            return vector(types[spec.value] || ValueType);
    }

    return types[spec.type];
}

