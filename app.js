define(function (require) {
	var $ = require("jquery"),
		_ = require("lodash"),
		monster = require("monster");

	var app = {
		name: "parkinglot",

		css: ["app"],

		i18n: {
			"en-US": { customCss: false },
		},

		// Defines API requests not included in the SDK
		requests: {},

		// Define the events available for other apps
		subscribe: {},

		// Method used by the Monster-UI Framework, shouldn't be touched unless you're doing some advanced kind of stuff!
		load: function (callback) {
			var self = this;

			self.initApp(function () {
				callback && callback(self);
			});
		},

		// Method used by the Monster-UI Framework, shouldn't be touched unless you're doing some advanced kind of stuff!
		initApp: function (callback) {
			var self = this;

			// Used to init the auth token and account id of this app
			monster.pub("auth.initApp", {
				app: self,
				callback: callback,
			});
		},

		//////////////////////////////////////////////////////////
		// Entry Point of the app
		//////////////////////////////////////////////////////////

		render: function (container) {
			var self = this,
				$container = _.isEmpty(container)
					? $("#monster_content")
					: container,
				$layout = $(
					self.getTemplate({
						name: "layout",
					})
				);

			self.bindEvents({
				template: $layout,
			});

			$container.empty().append($layout); //draw the main part of the page in views/layout.html
		},

		bindEvents: function (args) {
			var self = this,
				$template = args.template;

			//load the parked calls on document ready, and repeat every 30 seconds
			$(document).ready(function (e) {
				loadParkingLot();
				setInterval(loadParkingLot, 30000);
			});

			//Refresh parked calls button binding event:
			$template.find("#refresh").on("click", function (e) {
				loadParkingLot();
			});

			//Help Button/Dialog
			$template.find("#help-button").on("click", function (e) {
				var helptemplate = $(app.getTemplate({
					name: 'dialog-help'
				}));

				monster.ui.dialog(helptemplate, {
					title: app.i18n.active().parkinglot.help.title,
					width: '600px',
					onClose: function() {
				    	//doStuff();
					}
				});
			});

			//function to load the parked calls onto the page and set dependent bindings
			function loadParkingLot() {
				self.getParkedCalls(function (listOfParkedCalls) {
					var $results = $(
						self.getTemplate({
							name: "results",
							data: {
								parkedCalls: listOfParkedCalls.slots,
							},
						})
					);

					$template.find(".results").empty().append($results);

					///Pickup a parked call binding
					$template.find(".pickup").on("click", function (e) {
						//var parkNum = parkedUri.substr(0, parkedUri.indexOf('@'));  //strip off the @domain.tld suffix
						var parkedUri = $(this)
							.closest(".parked-call")
							.attr("id"); //get the id, which is the parked call URI
						var parkNum = parkedUri.split("@")[0]; //strip off the @domain.tld if it exists (but doesn't fail if not)
						var parkSlot = parkNum.substring(2); //strip off the first 2 chars in case it's *4 instead of *3.
						self.pickupCall("*3" + parkSlot);
						//console.log(parkNum);
					});
					///////////////////////////////
					///Call the parker (the device who parked the call):
					$template.find(".call-parker").on("click", function (e) {
						var ringbackId = $(this).attr("id"); //get the id, which is the parker device ID
						self.callTheParker(ringbackId);
					});
					///////////////////////////////
				
					$template.find(".parked-call").on("mouseover", function (e) { //load more details about parker when hover
						var clickedItem = $(this);
						if ($(clickedItem).find('.call-parker').html() == '') { //check if the parker info is empty
							self.callApi({
							// Get info on the parker device:
							resource: "device.get",
							data: {
								accountId: self.accountId,
								deviceId: $(this).find('.call-parker').attr('id')
							},
							success: function (deviceData) {
								self.callApi({
									// Get info on the user the parker device belongs to:
									resource: "user.get",
									data: {
										accountId: self.accountId,
										userId: deviceData.data.owner_id
									},
									success: function (userData) {
										var parker_name = userData.data.caller_id.internal.name;
										var parker_number = userData.data.caller_id.internal.number;
										$(clickedItem).find('.call-parker').html(parker_name+' '+parker_number);
										$(clickedItem).find('.call-parker_hidden').css('display', 'inline');
									},
									error: function (parsedError) {
										monster.ui.alert("FAILED to get user info for parking slot #" + slot.parking_slot + ": " + parsedError);
									},
								}); //end get info on user
							},
							error: function (parsedError) {
								monster.ui.alert("FAILED to get device info: " + slot.ringback_id + ": " + parsedError);
							},
						}); //end get info on parker device
						} //if clickedItem parker info is empty
					}); //end parked-call mouseover binding
				}); //end self.getParkedCalls
			} //end function loadParkingLot();
		}, //bindEvents

		getParkedCalls: function (callback) {
			var self = this;
			self.callApi({
				resource: "parkedCalls.list",
				data: {
					accountId: self.accountId,
				},
				success: function (data) {
					$.each(data.data.slots, function (index, slot) {
						slot.parking_slot = index;
					}); //end $.each
					//console.log(JSON.stringify(data.data));
					callback(data.data);
				},
				error: function (parsedError) {
					//console.log(parsedError);
					if (data.data.error == "401") {
						//if we get a 401 when refreshing parked calls, log out so user can re-auth.
						monster.util.logoutAndReload();
					}
					monster.ui.alert("ERROR: Failed to get parked calls list: " + parsedError);
					callback([]); //Populate results with nothing
				},
			}); //end get parked calls list
		}, //end getParkedCalls

		pickupCall: function (dialNumber) {
			var self = this;

			self.callApi({
				resource: "user.quickcall",
				data: {
					accountId: self.accountId,
					userId: monster.apps.auth.currentUser.id,
					//userId: 'd89c34618dc8fa28fc5deead6cc64a4d',
					number: dialNumber,
				},
				success: function (data) {
					console.log(
						"Success creating quickcall! : " + JSON.stringify(data)
					);
					//monster.ui.alert("Success creating quickcall! : "+data);
					//callback(data.data);
				},
				error: function (parsedError) {
					monster.ui.alert(
						"FAILED to create call:" +
							number +
							" for " +
							userID +
							": " +
							parsedError
					);
					//callback([]);
				},
			});
		},

		callTheParker: function (parkerDeviceId) {
			var self = this;

			self.callApi({
				resource: "user.get", //get my extension to use for quickcall
				data: {
					accountId: self.accountId,
					userId: monster.apps.auth.currentUser.id,
				},
				success: function (data) {
					console.log(
						"Success getting user: " +
							data.data.caller_id.internal.number
					);
					self.callApi({
						resource: "device.quickcall",
						data: {
							accountId: self.accountId,
							deviceId: parkerDeviceId,
							number: data.data.caller_id.internal.number,
						},
						success: function (data) {
							console.log(
								"Called: " +
									parkerDeviceId +
									" from " +
									data.data.caller_id.internal.number
							);
						},
						error: function (parsedError) {
							monster.ui.alert(
								"FAILED to create call to " +
									data.data.caller_id.internal.number +
									" for original parker device: " +
									parkerDeviceId +
									": " +
									parsedError
							);
						},
					});
				},
				error: function (parsedError) {
					monster.ui.alert(
						"FAILED to get your extension - userId: " +
							userID +
							": " +
							parsedError
					);
				},
			});
		}, //callTheParker

		////////////////////////////////////////////////////////
	};

	return app;
});
