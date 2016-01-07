define(["jquery","underscore","text!../tmpl/progressDialog.html"],function($,_,template) {
    var This = function() {
        this.init.apply(this,arguments);
    }

    $.extend(This.prototype, {
        init:function(title,waiting) {
            this.$el = $("<div class='progressDialog modal fade'/>");
            this.waiting = waiting;

            this.$el.append(template);

            if (title) this.setTitle(title);
            if (this.waiting) this.$el.find(".progress-bar").css("width","100%").text("");
        },
        update:function(percent) {
            if (this.waiting) {
                this.$el.find(".progress-bar").css("width","100%").text("");
            } else {
                this.$el.find(".progress-bar").css("width",percent+"%").text(percent+"%");
            }
        },
        setTitle:function(title) {
            this.$el.find(".modal-title").html(title);
        },
        show:function() {
            this.$el.appendTo(document.body);
            this.$el.modal({
                "backdrop":"static"
            });
            this.$el.modal('show');
            return this;
        },
        hide:function() {
            this.$el.modal('hide');
            this.$el.remove();
        },
        hidecb:function() {
            return _.bind(this.hide,this);
        }
    });

    return This;
});

