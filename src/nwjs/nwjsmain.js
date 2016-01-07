var nw = require('nw.gui');
var fs = require("fs");
var path = require("path");

requirejs.config({
    nodeRequire:require,
    baseUrl: "./view/lib",
    "shim": {
    },
    paths: {
        "view":"..",
        "tmpl":"../tmpl",
    }
});

var win = nw.Window.get();
var nativeMenuBar = new nw.Menu({ type: "menubar" });
try {
    nativeMenuBar.createMacBuiltin("My App");
    win.menu = nativeMenuBar;
} catch (ex) {
}

win.moveTo(100,30);
win.width = 1200;

var debugMode = false;
if (debugMode) {
    var dev = win.showDevTools();
    dev.moveTo(0,win.height+40);
    dev.height =  window.screen.availHeight - win.height - 20;
    dev.width =  window.screen.availWidth;
}

win.focus();

nw.App.setCrashDumpDir("./");

requirejs(['jquery','./view/Main.js'],function($,Main) {
    window.jQuery = $;
    $(document).ready(function() {
        var bootstrap = document.createElement("script");
        document.body.appendChild(bootstrap);
        $(bootstrap).load(function() {
            var main = new Main();
        });
        bootstrap.src = "https://maxcdn.bootstrapcdn.com/bootstrap/3.3.2/js/bootstrap.min.js";
    });
});

window.onkeydown = function(e) {
    if (e.keyCode == 27) nw.App.closeAllWindows();
};
