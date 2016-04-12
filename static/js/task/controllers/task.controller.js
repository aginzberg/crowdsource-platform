(function () {
    'use strict';

    angular
        .module('crowdsource.task.controllers', [])
        .controller('TaskController', TaskController);

    TaskController.$inject = ['$scope', '$state', '$mdToast', '$log', '$http', '$stateParams',
        'Task', 'Authentication', 'Template', '$sce', '$filter', '$rootScope', 'RatingService', '$cookies', 'User', '$timeout'];

    function TaskController($scope, $state, $mdToast, $log, $http, $stateParams, Task, Authentication, Template, $sce,
                            $filter, $rootScope, RatingService, $cookies, User, $timeout) {
        var self = this;

        var userAccount = Authentication.getAuthenticatedAccount();

        self.taskData = null;

        self.skip = skip;
        self.submitOrSave = submitOrSave;
        self.saveComment = saveComment;
        self.openChat = openChat;
        self.updateUserPreferences = updateUserPreferences;

        self.gotIt = gotIt;
        self.has_read_tooltip = true;
        self.timerRunning = false;
        self.toggleTimer = toggleTimer;
        self.toggleTimerVisibility = toggleTimerVisibility;
        self.readyToSubmit = false;
        self.timerEditable = false;
        self.editTimer = editTimer;
        self.timerMilliseconds = 0;
        self.setRating = setRating;
        self.showRatingTooltip = false;
        self.worker_config = null;
        self.tooltipOneTitle = null;
        self.tooltipOneBody = null;
        self.tooltipTwoTitle = null;
        self.tooltipTwoBody = null;
        self.tooltipBoomerangOne = null;
        self.tooltipBoomerangTwo = null;
        self.tooltipBoomerangThree = null;
        self.tooltipTaller = false;
        /*
         (CONDITION_ONE, "BoomerangTreatment:TimerControl"),
         (CONDITION_TWO, 'BoomerangTreatment:TimerTreatment'),
         (CONDITION_THREE, 'BoomerangControl:TimerControl'),
         (CONDITION_FOUR, 'BoomerangControl:TimerTreatment')
         * */
        self.conditions = {
            CONDITION_ONE__BT_TC: 1,
            CONDITION_TWO__BT_TT: 2,
            CONDITION_THREE__BC_TC: 3,
            CONDITION_FOUR__BC_TT: 4
        };

        activate();

        function activate() {

            self.task_worker_id = $stateParams.taskWorkerId;
            self.task_id = $stateParams.taskId;

            self.isReturned = $stateParams.hasOwnProperty('returned');

            var id = self.task_id;

            if (self.isSavedQueue || self.isSavedReturnedQueue) {
                id = self.task_worker_id;
            }

            Task.getTaskWithData(id).then(function success(data) {
                    if (data[0].hasOwnProperty('rating')) {
                        self.rating = data[0].rating[0];
                        self.rating.current_rating = self.rating.weight;
                        self.rating.current_rating_id = self.rating.id;
                    } else {
                        self.rating = {};
                    }
                    self.rating.requester_alias = data[0].requester_alias;
                    self.rating.project = data[0].project;
                    self.rating.target = data[0].target;
                    self.taskData = data[0].data;
                    self.ratingTarget = data[0].target;
                    self.time_left = data[0].time_left;
                    self.taskData.id = self.taskData.task ? self.taskData.task : id;
                    if (self.taskData.has_comments) {
                        Task.getTaskComments(self.taskData.id).then(
                            function success(data) {
                                angular.extend(self.taskData, {'comments': data[0].comments});
                            },
                            function error(errData) {
                                var err = errData[0];
                                $mdToast.showSimple('Error fetching comments - ' + JSON.stringify(err));
                            }
                        ).finally(function () {
                        });
                    }

                    if (data[0].hasOwnProperty('auto_accept')) {
                        self.auto_accept = data[0].auto_accept;
                    } else {
                        self.auto_accept = false;
                    }
                    if (data[0].hasOwnProperty('has_read_tooltip')) {
                        self.has_read_tooltip = data[0].has_read_tooltip;
                        if (self.has_read_tooltip) {
                            $timeout(function () {
                                startTimer();
                            }, 1000, false);
                        }

                    } else {
                        self.has_read_tooltip = false;
                    }

                },
                function error(data) {
                    $mdToast.showSimple('Could not get task with data.');
                }).finally(function () {
                getRating();
                getWorkerConfig();
            });
        }


        function skip() {
            if (self.isSavedQueue || self.isSavedReturnedQueue) {
                //We drop this task rather than the conventional skip because
                //skip allocates a new task for the worker which we do not want if
                //they are in the saved queue
                Task.dropSavedTasks({task_ids: [self.task_id]}).then(
                    function success(data) {
                        gotoLocation(6, data);
                    },
                    function error(data) {
                        $mdToast.showSimple('Could not skip task.');
                    }).finally(function () {

                    }
                );
            } else {
                Task.skipTask(self.task_id).then(
                    function success(data) {
                        gotoLocation(6, data);
                    },
                    function error(data) {
                        $mdToast.showSimple('Could not skip task.');
                    }).finally(function () {

                    }
                );
            }
        }

        function submitOrSave(task_status) {
            var itemsToSubmit = $filter('filter')(self.taskData.template.template_items, {role: 'input'});
            var itemAnswers = [];
            var missing = false;

            angular.forEach(itemsToSubmit, function (obj) {
                if ((!obj.answer || obj.answer == "") && obj.type != 'checkbox') {
                    missing = true;
                    return;
                }

                if (obj.type != 'checkbox') {
                    itemAnswers.push(
                        {
                            template_item: obj.id,
                            result: obj.answer.toString() || ""
                        }
                    );
                }
                else {
                    itemAnswers.push(
                        {
                            template_item: obj.id,
                            result: obj.aux_attributes.options
                        }
                    );
                }
            });

            if (missing && task_status == 2) {
                $mdToast.showSimple('All fields are required.');
                return;
            }
            var requestData = {
                task: self.taskData.id,
                template_items: itemAnswers,
                task_status: task_status,
                saved: self.isSavedQueue || self.isSavedReturnedQueue,
                auto_accept: self.auto_accept
            };
            if (!self.readyToSubmit) {
                //self.readyToSubmit = true;
                self.timerOpen = true;
                stopTimer();
                /*if (!self.rating.id) {
                    self.showRatingTooltip = true;
                }*/
            }
            if (!self.rating.id) {
                self.showRatingTooltip = true;
                $mdToast.showSimple('Please rate this requester!');
                return;
            }
            var completion_time = self.timerMilliseconds / 1000;
            var sys_time = self.timerMilliseconds / 1000;
            if (self.timerEditable) {
                completion_time = self.timerMinutes * 60 + self.timerSeconds;
            }
            angular.extend(requestData, {'completion_time': completion_time, 'system_completion_time': sys_time});
            Task.submitTask(requestData).then(
                function success(data, status) {
                    gotoLocation(task_status, data);
                },
                function error(data, status) {
                    if (task_status == 1) {
                        $mdToast.showSimple('Could not save task.');
                    } else {
                        $mdToast.showSimple('Could not submit task.');
                    }
                }).finally(function () {
                }
            );
        }

        function saveComment() {
            Task.saveComment(self.taskData.id, self.comment.body).then(
                function success(data) {
                    if (self.taskData.comments == undefined) {
                        angular.extend(self.taskData, {'comments': []});
                    }
                    self.taskData.comments.push(data[0]);
                    self.comment.body = null;
                },
                function error(errData) {
                    var err = errData[0];
                    $mdToast.showSimple('Error saving comment - ' + JSON.stringify(err));
                });
        }

        function gotoLocation(task_status, data) {
            if (task_status == 1 || data[1] != 200) { //task is saved or failure
                $state.go('task_feed');
            } else if (task_status == 2 || task_status == 6) { //submit or skip
                if (self.auto_accept) {
                    $state.go('task', {taskId: data[0].task});
                } else {
                    $state.go('task_feed');
                }
            }

        }

        function openChat(requester) {
            $rootScope.openChat(requester);
        }

        function updateUserPreferences(auto_accept) {
            User.updatePreferences(userAccount.username, {'auto_accept': auto_accept}).then(function () {
            });
        }

        function getWorkerConfig() {
            User.getWorkerConfiguration().then(function (data) {
                self.worker_config = data[0];
                setTooltips();
            });
        }

        self.handleRatingSubmit = function (rating, entry) {
            if (entry.hasOwnProperty('current_rating_id')) {
                RatingService.updateRating(rating, entry).then(function success(resp) {
                    entry.current_rating = rating;
                }, function error(resp) {
                    $mdToast.showSimple('Could not update rating.');
                }).finally(function () {

                });
            } else {
                entry.reviewType = 'worker';
                RatingService.submitRating(rating, entry).then(function success(resp) {
                    entry.current_rating_id = resp[0].id;
                    entry.current_rating = rating;
                }, function error(resp) {
                    $mdToast.showSimple('Could not submit rating.')
                }).finally(function () {

                });
            }
        };

        function gotIt() {
            startTimer();
            User.updatePreferences(userAccount.username, {'has_read_tooltip': true}).then(
                function () {
                    self.has_read_tooltip = true;
                });
        }

        function startTimer() {
            self.timerRunning = true;
            $scope.$broadcast('timer-start');
        }

        function stopTimer() {
            self.timerRunning = false;
            $scope.$broadcast('timer-stop');
        }

        function resumeTimer() {
            self.timerRunning = true;
            $scope.$broadcast('timer-resume');
        }

        function toggleTimer() {
            if (self.timerRunning) {
                stopTimer();
            }
            else {
                resumeTimer();
            }
        }

        function toggleTimerVisibility() {
            self.timerOpen = !self.timerOpen;
        }

        function editTimer() {
            self.timerEditable = true;
            var time = new Date(self.timerMilliseconds);
            self.timerMinutes = time.getMinutes();
            self.timerSeconds = time.getSeconds();
        }

        $scope.$on('timer-tick', function (event, args) {
            self.timerMilliseconds = args.millis;
        });

        function getRating() {
            RatingService.listByTarget(self.ratingTarget, 'worker').then(
                function success(response) {
                    self.rating = response[0];
                },
                function error(response) {
                    $mdToast.showSimple('Could requester rating');
                }
            ).finally(function () {
            });
        }

        function setRating(rating, weight) {
            if (rating && rating.hasOwnProperty('id') && rating.id) {
                if (rating.weight == weight){
                    weight = 2.0;
                }
                RatingService.updateRating(weight, rating).then(function success(resp) {
                    rating.weight = weight;
                }, function error(resp) {
                    $mdToast.showSimple('Could not update rating.');
                }).finally(function () {

                });
            } else {
                RatingService.submitRating(weight, rating).then(function success(resp) {
                    rating.id = resp[0].id;
                    rating.weight = weight;
                }, function error(resp) {
                    $mdToast.showSimple('Could not submit rating.')
                }).finally(function () {

                });
            }
        }

        function setTooltips() {
            if (self.worker_config.condition == self.conditions.CONDITION_ONE__BT_TC ||
                self.worker_config.condition == self.conditions.CONDITION_THREE__BC_TC) {
                self.tooltipOneTitle = 'Automatic timekeeping.';
                //self.tooltipOneBody = 'The timer will tell you how long it takes you to finish this task.';
                self.tooltipOneBody = 'The timer sits here, use the clock icon to expand/collapse it.';
                self.tooltipTwoTitle = 'All done!';
                self.tooltipTwoBody = 'If it’s inaccurate, you can still modify it before submitting!';
                self.isTimerTreatment = false;
            }
            else {
                self.tooltipOneTitle = 'How much money will you make?';
                //self.tooltipOneBody = 'Our algorithm uses this time to predict your hourly wage for other tasks on the platform.';
                self.tooltipOneBody = 'The timer sits here, use the clock icon to expand/collapse it.';
                self.tooltipTwoTitle = 'Edit your time if needed.';
                self.tooltipTwoBody = 'Our algorithm uses this time to predict your hourly wage for future tasks on the platform.';
                self.tooltipTaller = true;
                self.isTimerTreatment = true;
            }

            if (self.worker_config.condition == self.conditions.CONDITION_ONE__BT_TC ||
                self.worker_config.condition == self.conditions.CONDITION_TWO__BT_TT) {
                self.isBoomerangTreatment = true;
                self.tooltipBoomerangOne = 'I don\'t like this: bury this requester\'s tasks at the bottom of my task feed';
                self.tooltipBoomerangTwo = 'Same: keep this requester\'s tasks in the middle of my task feed';
                self.tooltipBoomerangThree = 'I like this: feature this requester\'s tasks at the top of my task feed';
            }
            else {
                self.isBoomerangTreatment = false;
                self.tooltipBoomerangOne = 'I don\'t like this';
                self.tooltipBoomerangTwo = 'Ok';
                self.tooltipBoomerangThree = 'I like this';
            }
        }
    }
})();
