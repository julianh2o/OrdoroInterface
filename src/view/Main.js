var async = require("async");
var request = require('request');
var fs = require('fs');
var moment = require("moment");
var sprintf = require("sprintf-js").sprintf;
var extend = require("extend");
var querystring = require("querystring");
var path = require("path");
var spawn = require('child_process').spawn;
var shopifyAPI = require("shopify-node-api");
var skucustoms = require("./skucustoms");
var path = require("path");
var process = require("process");
var nodeopen = require("open");
var credentials = require("./credentials.js");

function getUserHome() {
    return process.env.HOME || process.env.USERPROFILE;
}

var downloadDirectory = path.normalize("./shippingLabels/");
var defaultDirectory = getUserHome();

define(["jquery","underscore","view/ProgressDialog","view/AddFundsDialog","text!tmpl/main.html"],function($,_,ProgressDialog,AddFundsDialog,template) {
    var This = function() {
        this.init.apply(this,arguments);
    }

    function updateQueryString(key, value, url) {
        var re = new RegExp("([?&])" + key + "=.*?(&|#|$)(.*)", "gi"),
            hash;

        if (re.test(url)) {
            if (typeof value !== 'undefined' && value !== null)
                return url.replace(re, '$1' + key + "=" + value + '$2$3');
            else {
                hash = url.split('#');
                url = hash[0].replace(re, '$1$3').replace(/(&|\?)$/, '');
                if (typeof hash[1] !== 'undefined' && hash[1] !== null) 
                    url += '#' + hash[1];
                return url;
            }
        }
        else {
            if (typeof value !== 'undefined' && value !== null) {
                var separator = url.indexOf('?') !== -1 ? '&' : '?';
                hash = url.split('#');
                url = hash[0] + separator + key + '=' + value;
                if (typeof hash[1] !== 'undefined' && hash[1] !== null) 
                    url += '#' + hash[1];
                return url;
            }
            else
                return url;
        }
    }

    var opt = {
        'auth': {
            'user': credentials.user,
            'pass': credentials.password
        }
    }

    function requestOne(url,key,cb) {
        console.log("Loading URL: ",url);
        request.get(url,opt,function(error,response,body) {
            var json = JSON.parse(body);
            if (!cb) return;
            if (key) return cb(error,json[key]);
            cb(error,json);
        });
    }

    function downloadFile(url,localPath,cb) {
        console.log("Downloading file: ",url);
        var nopt = extend({},opt,{
            method:"GET",
            uri:url,
        });
        request(nopt,function(error,response,body) {
            cb(error,localPath);
        }).pipe(fs.createWriteStream(localPath));
    }

    function sendGet(url,data,cb) {
        var queryString = querystring.stringify(data)
        url = url +"?"+ queryString;
        console.log("Loading URL: ",url);
        var nopt = extend({},opt,{
            method:"GET",
            uri:url,
        });
        request(nopt,function(error,response,body) {
            if (cb) cb(error,body);
        });
    }

    function sendPost(url,data,cb) {
        console.log("Posting URL: ",url,data);
        var nopt = extend({},opt,{
            method:"POST",
            uri:url,
            headers: {
                'Content-Type': 'application/json'
            },
        });
        if (data) nopt["json"] = data;
        request(nopt,function(error,response,body) {
            if (cb) cb(error,body);
        });
    }

    function requestPages(url,key,cb) {
        var items = [];
        function fetchPages(offset) {
            var pageurl = updateQueryString("offset",offset,url);
            console.log("Loading page: ",pageurl);
            request.get(pageurl,opt,function(error,response,body) {
                var json = JSON.parse(body);
                if (body.indexOf("error_message") && !json[key]) {
                    console.log("Error while loading page: ",body);
                    if (cb) cb(body,[]);
                    return;
                }
                var done = offset+json.limit > json.count;
                items = items.concat(json[key]);
                if (done) {
                    cb(null,items);
                } else {
                    fetchPages(offset+json.limit);
                }
            });
        }

        fetchPages(0);
    }

    function checkImportStatus(cb) {
        requestOne("https://api.ordoro.com/activity/?limit=5&type=import_orders_from_cart","activity",function(error,list) {
            var complete = true;
            _.each(list,function(item) {
                if (!item.complete || item.complete == false) complete = false;
            });
            cb(complete);
        });
    }

    function waitForImportComplete(cb) {
        var checkStatusTimer = null;
        function check() {
            checkImportStatus(function(complete) {
                if (complete) {
                    clearInterval(checkStatusTimer);
                    cb();
                }
            });
        }
        checkStatusTimer = setInterval(check,10*1000);
        check();
    }

    function getCarts(cb) {
        requestPages("https://api.ordoro.com/cart","cart",cb);
    }

    function updateCart(id,cb) {
        sendPost("https://api.ordoro.com/task/",{"type":"import_orders_from_cart","cart":id},cb);
    }

    function loadIncompleteOrders(cb) {
        async.parallel([
            function(cb) {
                requestPages("https://api.ordoro.com/order/?status=in_process","order",cb);
            },function(cb) {
                requestPages("https://api.ordoro.com/order/?status=new","order",cb);
            }],
            function(err,results) {
                if (err) {
                    cb(err,[]);
                    return;
                }
                var orders = _.flatten(results,true);
                cb(err,orders);
            }
        );
    }

    function syncAllCarts(cb) {
        getCarts(function(error,carts) {
            var ids = _.chain(carts).reject(function(item) { return item.vendor == "manual" }).pluck("id").value();
            async.each(ids,function(item,callback) {
                updateCart(item,callback);
            },function(err) {
                waitForImportComplete(function() {
                    cb(err);
                });
            });
        });
    }

    function renderTable(headers,data) {
        var $table = $("<table />");
        var $header = $("<tr />");
        _.each(headers,function(h) {
            var $td = $("<th />");
            $td.append(h);
            $header.append($td);
        });
        $table.append($header);
        _.each(data,function(columns) {
            var $row = $("<tr>");
            _.each(columns,function(item,index) {
                var $td = $("<td />");
                if (headers.length > index) $td.addClass(headers[index].toLowerCase());
                $td.append(item);
                $row.append($td);
            });
            $table.append($row);
        });
        return $table;
    }

    function getShippers(cb) {
        requestOne("https://api.ordoro.com/shipper/","shipper",cb);
    }

    function getEndiciaId(cb) {
        getShippers(function(err,shippers) {
            var endicia = _.find(shippers,function(item) {return item.vendor == "endicia"});
            cb(err,endicia.id);
        });
    }

    function getShipperBalance(id,cb) {
        requestOne("https://api.ordoro.com/shipper/"+id+"/balance/","postage_balance",cb);
    }

    function addBalance(id,amount,cb) {
        sendPost("https://api.ordoro.com/shipper/"+id+"/balance/",{"amount":amount},function(err,balanceInfo) {
            cb(err,balanceInfo.postage_balance);
        });
    }

    function generateCustoms(items) {
        var countBySku = {};
        var infoBySku = {};
        _.each(items,function(item) {
            if (!countBySku[item.product.sku]) countBySku[item.product.sku] = 0;
            countBySku[item.product.sku] += 1;
            infoBySku[item.product.sku] = skucustoms[item.product.sku];
        });

        var customs = [];
        _.each(countBySku,function(count,sku) {
            infoBySku[sku].quantity = count;
            customs.push(infoBySku[sku]);
        });

        return customs;
    }

    function generateLabelParams(shipmentId,shipperId,method,box,items) {
        //methods: Priority,PriorityExpress,PriorityMailInternational
        //box: MediumFlatRateBox, FlatRatePaddedEnvelope
        var params = {
            shipper_type:"endicia",
            shipper_id:shipperId,
            box_shape:box,
            delivery_confirmation:method == "PriorityMail" || method == "PriorityMailExpress" ? "DeliveryConfirmation" : "None",
            nondelivery_option:"Return", //Return, Abandon
            email_bill_to:false,
            email_ship_to:false,
            hold_for_pickup:false,
            contents_type:"Merchandise",
            reference_number:shipmentId,
            width:1,
            height:1,
            length:1,
            value:0,
            date_advance:0
        };
        if (items) {
            params.customs_forms=generateCustoms(items);
        }
        if (method) {
            params.shipping_method = method;
        }
        return params;
    }

    function postGenerateLabel(shipmentId,shipperId,method,box,items,cb) {
        sendPost("https://api.ordoro.com/shipment/"+shipmentId+"/label/generate/",generateLabelParams(shipmentId,shipperId,method,box,items),cb); 
    }

    function testLabel(shipmentId,shipperId,uspstype,box,cb) {
        var params = generateLabelParams(shipmentId,shipperId,uspstype,box,null);
        sendGet("https://api.ordoro.com/shipment/"+shipmentId+"/label/rate/",params,function(err,body) {
            var json = JSON.parse(body);
            cb(err,json.info);
        });
    }

    function downloadLabel(shipmentId,cb) {
        if (!fs.existsSync(downloadDirectory)){
            fs.mkdirSync(downloadDirectory);
        }
        downloadFile("https://app.ordoro.com/api/label/pdf/?type=single_page&default=desktop&s="+shipmentId,path.join(downloadDirectory,shipmentId+".pdf"),cb);
    }

    function generateBoxSelect() {
        var shippingOptions = ["FlatRatePaddedEnvelope","MediumFlatRateBox"];
        var $select = $("<select />");
        _.each(shippingOptions,function(item) {
            var $opt = $("<option />");
            $opt.val(item);
            $opt.text(item);
            $select.append($opt);
        });
        return $select;
    }

    function mergeLabels(paths,cb) {
        var opts = ['-jar', './LabelMerge.jar'];
        opts = opts.concat(paths);
        var child = spawn('java', opts);
        child.on("close",function(code) {
            if (cb) cb("./out.pdf",code != 0);
        });
    }

    function promptSaveLocation(filename,cb) {
        var $input = $("<input type=\"file\" />");
        $input.attr("nwsaveas",filename);
        $input.attr("nwworkingdir",defaultDirectory);
        $(document.body).append($input);
        $input.click();
        $input.hide();
        $input.change(function() {
            $input.remove();
            cb($input.val());
        });
    }

    function generatePackingList(orders) {
        var out = "";
        _.each(orders,function(order) {
            out += order.order_id+": "+order.shipping_address.name + " ("+order.lines.length+" items) "+order.notes_from_customer+"\n";
            _.each(order.lines,function(item) {
                out += "\t"+item.quantity + " " + item.product.sku + " - " + item.product.name + "\n";
            });
            out += "\n";
        });
        return out;
    }

    function createShipment(orderId,cb) {
        sendPost("https://api.ordoro.com/order/"+orderId+"/create_shipment/",null,cb);
    }

    $.extend(This.prototype,{
        init:function() {
            this.$el = $(document.body);
            this.$el.append(template);
            this.endicia = 46224;
            this.balance = null;
            this.$el.find(".syncButton").click(_.bind(this.doSync,this));
            this.$el.find(".processOrders").click(_.bind(this.processOrders,this));
            this.$el.find(".generateLabels").click(_.bind(this.generateLabels,this));

            async.parallel([_.bind(function(cb) {
                this.reloadOrders(cb);
            },this),_.bind(function(cb) {
                this.refreshBalance();
            },this)],_.bind(function() {
                //initialization complete
            },this));

//            getEndiciaId(_.bind(function(err,id) {
//                this.endicia = id;
//            },this));
        },
        refreshBalance:function() {
            getShipperBalance(this.endicia,_.bind(function(err,balance) {
                this.balanceUpdated(balance);
            },this));
        },
        balanceUpdated:function(balance) {
            this.balance = balance;
            this.$el.find(".balance").text("Balance: $"+balance.toFixed(2));
        },
        test_reloadOrders:function(cb) {
            var load = true;
            fs.readFile("output.json",_.bind(function(err,data) {
                if (!load || err) {
                    requestPages("https://api.ordoro.com/order/?status=shipped","order",_.bind(function(err,orders) {
                        if (err) {
                            console.log("failed to fetch orders");
                            return;
                        }
                        fs.writeFileSync("output.json",JSON.stringify(orders));
                        this.handleOrderList(orders);
                    },this));
                    return;
                }
                var orders = JSON.parse(data);
                var inters = _.filter(orders,function(item) { return item.shipping_address.country != "US"});
                var interexp = _.filter(inters,function(item) { return item.shipping_type.toLowerCase().indexOf("express") != -1});
                //orders = _.last(orders,5);
                //orders.push(_.last(inters));
                //orders.push(_.last(interexp));

                orders = [_.last(orders)];

                _.each(orders,function(item) {
                    item.status = "in_process";

                });
                this.handleOrderList(orders);
                if (cb) cb();
            },this));
        },
        reloadOrders:function(cb) {
            //return this.test_reloadOrders(cb);
            console.log("Reloading orders..");
            loadIncompleteOrders(_.bind(function(err,orders) {
                this.handleOrderList(orders);
                if (cb) cb();
            },this));
        },
        doSync:function() {
            var progress = new ProgressDialog("Syncing orders...",true).show();
            syncAllCarts(_.bind(function() {
                progress.setTitle("Loading orders...");
                loadIncompleteOrders(_.bind(function(err,orders) {
                    this.handleOrderList(orders);
                    progress.hide();
                },this));
            },this));
        },
        processOrders:function() {
            var newOrders = _.filter(this.orders,function(item) {return item.status == "new"})
            if (newOrders.length == 0) return;
            var progress = new ProgressDialog("Creating shipments...",true).show();
            async.each(newOrders,function(item,callback) {
                createShipment(item.order_id,callback);
            },_.bind(function(err) {
                console.log(err);
                this.reloadOrders(progress.hidecb());
            },this));
        },
        generateLabels:function() {
            var inProcessOrders = _.filter(this.orders,function(item) {return item.status == "in_process"});
            if (inProcessOrders.length == 0) return;

            var cost = 0;
            var fail = false;
            _.each(inProcessOrders,function(item) {
                if (!item.shipCost) {
                    console.log("ERROR! no shipcost for ",item);
                    fail = true;
                }
                cost += item.shipCost;
            });
            if (fail) return;
            if (!this.balance) {
                console.log("no balance..! D:");
                return;
            }
            if (this.balance-cost < 0) {
                var addfunds = new AddFundsDialog(this.balance,cost).show();
                $(addfunds).on("AddFunds",_.bind(function(e,add) {
                    addBalance(this.endicia,add,_.bind(function() {
                        this.generateAllLabels();
                    },this));
                },this));
            } else {
                this.generateAllLabels();
            }
        },
        generateAllLabels:function() {
            var inProcessOrders = _.filter(this.orders,function(item) {return item.status == "in_process"});
            if (inProcessOrders.length == 0) return;

            var packingList = generatePackingList(inProcessOrders);

            var location = promptSaveLocation("shippingLabels_"+moment().format("MM_DD_YY")+".pdf",_.bind(function(file) {
                var progress = new ProgressDialog("Generating labels...",true).show();
                async.each(inProcessOrders,_.bind(function(order,callback) {
                    if (order.shipments.length > 1) console.log("ERRR MULTIPLE SHIPMENTS, CHECK MANUALLY: ",order.order_id);
                    console.log("Generating label for "+order.shipments[0].shipment_id);
                    postGenerateLabel(order.shipments[0].shipment_id,this.endicia,order.shipMethod,order.shipBox,order.lines,callback);
                },this),_.bind(function(err,results) {
                    this.refreshBalance();
                    progress.setTitle("Downloading labels...");
                    async.map(inProcessOrders,_.bind(function(order,callback) {
                        console.log("Downloading label for "+order.shipments[0].shipment_id);
                        downloadLabel(order.shipments[0].shipment_id,callback);
                    },this),_.bind(function(err,results) {
                        progress.setTitle("Merging labels...");
                        console.log("Merging labels...");
                        mergeLabels(results,_.bind(function(output) {
                            progress.setTitle("Writing files...");
                            console.log("Writing files...");
                            fs.rename(output,file,_.bind(function() {
                                var packingListPath = file.replace(/\.[^/.]+$/, "")+".packingList.txt";
                                fs.writeFile(packingListPath,packingList,_.bind(function() {
                                    progress.hide();
                                    console.log("file",file);
                                    nodeopen(file);
                                    nodeopen(packingListPath);
                                    this.reloadOrders();
                                },this));
                            },this));
                        },this));
                    },this));
                },this));
            },this));

        },
        handleOrderList:function(orders) {
            this.orders = orders;
            var $orders = this.$el.find(".orderList");
            var header = ["Status","Order ID","Date","Shipping","Cost","Name","Address","Count","Items","Notes","Err"];
            var data = [];
            var newOrders = _.filter(orders,function(item) {return item.status == "new"})
            var inProcessOrders = _.filter(orders,function(item) {return item.status == "in_process"});
            this.$el.find(".newCount").text(newOrders.length);
            this.$el.find(".processOrders").toggleClass("disabled",newOrders.length == 0);
            this.$el.find(".readyCount").text(inProcessOrders.length);
            this.$el.find(".generateLabels").toggleClass("disabled",inProcessOrders.length == 0);
            _.each(orders,_.bind(function(order) {
                var date = moment(order.order_date);
                var addressText = "";
                var name = "";
                var err = [];
                var address = order.shipping_address;
                name = address.name;
                addressText = [
                    address.street1,
                    address.city+", "+address.state+" "+address.zip+", "+address.country
                ].join("<br/>");
                if (order.shipments.length != 1) err.push("MULT SHIP!");

                err = "<span class='err'>"+err.join(",")+"</span>";
                var shipping = $("<div class='shipping' />");
                var isExpress = order.shipping_type && order.shipping_type.toLowerCase().indexOf("express") != -1;
                var shipperId = this.endicia;
                var isInternational = address.country != "US";
                var boxSelect = generateBoxSelect();

                var $shippingCost = $("<span class='cost' />");
                function updateShippingCost() {
                    var box_size = boxSelect.val();
                    var uspstype = "";
                    if (isExpress) {
                        if (isInternational)
                            uspstype = "ExpressMailInternational";
                        else
                            uspstype = "PriorityExpress";
                    } else {
                        if (isInternational)
                            uspstype = "PriorityMailInternational";
                        else
                            uspstype = "Priority";
                    }
                    order.shipMethod = uspstype;
                    order.shipBox = box_size;
                    testLabel(order.shipments[0].shipment_id,shipperId,uspstype,box_size,_.bind(function(err,results) {
                        _.each(results,function(item) {
                            if (item.service_type==uspstype && item.package==box_size) {
                                found = item;
                            }
                        });
                        if (found) {
                            order.shipCost = found.cost;
                            $shippingCost.empty().append("$"+found.cost.toFixed(2));
                        } else {
                            $shippingCost.empty().append("ERR");
                        }
                        var sum = 0;
                        _.each(orders,function(item) {
                            sum += item.shipCost || 0;
                        });
                        this.$el.find(".shippingcost").text("Total ship cost: $"+sum.toFixed(2));
                    },this));
                }

                shipping.append(boxSelect);
                var $shipspeed = $("<span />");
                function updateShipspeed() {
                    $shipspeed.empty();
                    if (isExpress) {
                        $shipspeed.append(" <span class='label label-primary'>Express</span>");
                    } else {
                        $shipspeed.append(" <span class='label label-default'>Standard</span>");
                    }
                }
                $shipspeed.click(_.bind(function() {
                    isExpress = !isExpress;
                    updateShipspeed();
                    updateShippingCost();
                },this));
                shipping.append($shipspeed);
                if (order.status == "in_process") {
                    updateShippingCost.apply(this);
                    boxSelect.change(_.bind(updateShippingCost,this));
                    updateShipspeed();
                } else {
                    shipping.empty();
                }
                var $items = $("<div class='items' />");
                _.each(order.lines,function(item,index) {
                    if (index != 0) items.append("<br/>");
                    $items.append(item.quantity + " " + item.product.sku + " - " + item.product.name);
                });

                if(isInternational) name += " <span class='label label-info'>International</span>";
                var row = [order.status,order.order_id,date.format('M/D/YYYY'),shipping,$shippingCost,name,addressText,order.lines.length,$items,order.notes_from_customer,err];
                data.push(row);
            },this));
            $orders.empty().append(renderTable(header,data));
        },
    });

    return This;
});



