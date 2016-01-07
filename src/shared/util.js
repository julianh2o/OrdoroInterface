({ define: typeof define === "function"
    ? define
    : function(A,F) { module.exports = F.apply(null, A.map(require)) } }).
define([ "underscore" ],
    function (_) {
        return {
            ////Implementation here
        }
    }
);
