(() => {
const factory = (Messages) => {
    Messages = Messages || {};
    Messages._getKey = k => { return Messages[k]; };
    return Messages;
};

if (typeof(module) !== 'undefined' && module.exports) {
    var Msg = require('../www/common/translations/messages.json');
    module.exports = factory(Msg);
} else if ((typeof(define) !== 'undefined' && define !== null) && (define.amd !== null)) {
    define([], factory);
}
})();
