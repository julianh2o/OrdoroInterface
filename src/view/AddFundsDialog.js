define(["jquery","underscore","text!../tmpl/addFundsDialog.html"],function($,_,template) {
    var This = function() {
        this.init.apply(this,arguments);
    }

    $.extend(This.prototype, {
        init:function(balance,cost) {
            this.$el = $("<div class='addFunds modal fade'/>");

            this.$el.append(template);
            this.balance = balance;
            this.cost = cost;
            this.$el.find(".balance").text("$"+balance.toFixed(2));
            this.$el.find(".cost").text("$"+cost.toFixed(2));
            this.$add = this.$el.find(".add")
            this.$add.on('keypress keyup',_.bind(this.updateTotal,this));

            var add = -(balance - cost)
            if (add < 10) add = 10;
            this.$add.val(add.toFixed());
            this.updateTotal();

            this.$el.find(".addfunds").click(_.bind(this.addFundsClicked,this));
        },
        addFundsClicked:function() {
            this.hide();
            var add = parseFloat(this.$add.val());
            if (!add || add == NaN) add = 0;
            $(this).trigger("AddFunds",add);
        },
        updateTotal:function() {
            var add = parseFloat(this.$add.val());
            if (!add || add == NaN) add = 0;
            this.$el.find(".lessthanten").toggleClass("visible",add < 10);
            var total = this.balance - this.cost + add;
            var $remaining = this.$el.find(".remaining")
            var val = "$"+total.toFixed(2);
            $remaining.text(val);
        },
        show:function() {
            this.$el.appendTo(document.body);
            this.$el.modal('show');
            return this;
        },
        hide:function() {
            this.$el.modal('hide');
            this.$el.remove();
        }
    });

    return This;
});

