/**
 * TaskFeedController
 * @namespace crowdsource.task-feed.controllers
 * @author dmorina
 */
(function () {
    'use strict';

    angular
        .module('crowdsource.task-feed.controllers')
        .controller('TaskFeedController', TaskFeedController);

    TaskFeedController.$inject = ['$window', '$state', '$scope', '$mdToast', 'TaskFeed',
        '$filter', 'Authentication', 'TaskWorker', 'Project', '$rootScope', '$stateParams', 'User'];

    /**
     * @namespace TaskFeedController
     */
    function TaskFeedController($window, $state, $scope, $mdToast, TaskFeed,
                                $filter, Authentication, TaskWorker, Project, $rootScope, $stateParams, User) {

        var userAccount = Authentication.getAuthenticatedAccount();

        var self = this;
        self.projects = [];
        self.previewedProject = null;
        self.showPreview = showPreview;
        self.openTask = openTask;
        self.openComments = openComments;
        self.saveComment = saveComment;
        self.loading = true;
        self.getStatusName = getStatusName;
        self.getRatingPercentage = getRatingPercentage;
        self.openChat = openChat;
        self.emptyState = 'No free tasks available';
        self.worker_config = null;
        self.workerRequesters = [];
        self.workerProjectsRaw = [];
        self.moveUp = moveUp;
        self.moveDown = moveDown;
        self.submitRankings = submitRankings;
        self.rankingsSubmitted = false;
        self.gotIt = gotIt;
        self.has_read_tooltip = true;
        self.showToolTip = false;
        self.getRateText = getRateText;
        self.requesterRatingLabel = requesterRatingLabel;
        self.requesterPicks = false;
        self.sampled_requesters = [];
        self.postChoices = postChoices;
        self.round = 1;
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
        self.HTTP_410_GONE = 410;

        activate();

        function activate() {
            if ($state.current.name == 'feed-end') {
                getWorkerProjects();
                return;
            }
            if ($stateParams.projectId) {
                self.openTask($stateParams.projectId);
            }
            else {
                getProjects();
            }
            getWorkerConfig();
        }

        function getProjects() {
            TaskFeed.getProjects().then(
                function success(data) {
                    self.has_read_tooltip = data[0].has_read_tooltip_feed;
                    self.projects = data[0].projects.filter(function (project) {
                        return project.available_tasks > 0;
                    });
                    self.availableTasks = self.projects.length > 0;
                    if (!self.availableTasks) {
                        sampleRequesters();
                        self.requesterPicks = true;
                    }
                },
                function error(errData) {
                    if (errData[1] == self.HTTP_410_GONE) {
                        $mdToast.showSimple(errData[0].message);
                        self.emptyState = errData[0].message;
                        return;
                    }
                    self.error = errData[0].detail;
                    $mdToast.showSimple('Could not fetch projects.');
                }
            ).finally(function () {
                self.loading = false;
            });
        }

        function showPreview(project) {
            if (project.template && project.show_preview) {
                project.show_preview = false;
            }
            else if (project.template && !project.show_preview) {
                project.show_preview = true;
            }
            else {
                project.show_preview = true;
                Project.getPreview(project.id).then(
                    function success(data) {
                        angular.extend(project, {'template': data[0].template});
                        project.show_preview = true;
                    },
                    function error(errData) {
                        var err = errData[0];
                        $mdToast.showSimple('Error fetching preview.');
                    }
                ).finally(function () {
                });
            }
        }

        function openTask(project_id) {
            TaskWorker.attemptAllocateTask(project_id).then(
                function success(data, status) {
                    if (data[1] == 204) {
                        $mdToast.showSimple('Error: No more tasks left.');
                        $state.go('task_feed');
                    }
                    else {
                        var task_id = data[0].task;
                        var taskWorkerId = data[0].id;
                        $state.go('task', {taskId: task_id});
                    }

                },
                function error(errData) {
                    var err = errData[0];
                    var message = null;
                    if (err.hasOwnProperty('detail')) {
                        message = err.detail;
                    }
                    else {
                        message = JSON.stringify(err);
                    }
                    $mdToast.showSimple('Error: ' + message);
                    $state.go('task_feed');
                }
            ).finally(function () {
            });
        }

        function openComments(project) {
            if (project.comments && project.is_comment_expanded) {
                project.is_comment_expanded = false;
            }
            else if (project.comments && !project.is_comment_expanded) {
                project.is_comment_expanded = true;
            }
            else {
                Project.getProjectComments(project.id).then(
                    function success(data) {
                        angular.extend(project, {'comments': data[0].comments});
                        project.is_comment_expanded = true;
                    },
                    function error(errData) {
                        var err = errData[0];
                        $mdToast.showSimple('Error fetching comments - ' + JSON.stringify(err));
                    }
                ).finally(function () {
                });
            }
        }

        function saveComment(project) {
            TaskFeed.saveComment(project.id, self.comment.body).then(
                function success(data) {
                    if (project.comments == undefined) {
                        angular.extend(project, {'comments': []});
                    }
                    project.comments.push(data[0]);
                    self.comment.body = null;
                },
                function error(errData) {
                    var err = errData[0];
                    $mdToast.showSimple('Error saving comment - ' + JSON.stringify(err));
                }
            ).finally(function () {
            });
        }

        function getStatusName(statusId) {
            if (statusId == 5) return 'Paused';
            else if (statusId == 4) return 'Completed';
            else return 'Running';
        }

        function getRatingPercentage(rating, circle) {
            if (rating == null) return 0;
            return rating >= circle ? 100 : rating >= circle - 1 ? (rating - circle + 1) * 100 : 0;
        }

        function openChat(requester) {
            $rootScope.openChat(requester);
        }

        function getWorkerConfig() {
            User.getWorkerConfiguration().then(function (data) {
                self.worker_config = data[0];

                self.showToolTip = !(self.worker_config.condition == self.conditions.CONDITION_ONE__BT_TC ||
                self.worker_config.condition == self.conditions.CONDITION_THREE__BC_TC);
            });
        }


        function getWorkerProjects() {
            Project.listWorkerProjects().then(
                function success(response) {
                    self.loading = false;
                    var projects = response[0];
                    self.workerRequesters = _
                        .chain(projects)
                        .groupBy('owner_id')
                        .map(function (value, key) {
                            return {
                                requester_id: key,
                                requester_name: value[0].owner.alias,
                                project_names: _.pluck(value, 'name'),
                                projects: value.map(function (inner_value, inner_key) {
                                    return {
                                        name: inner_value.name,
                                        project_id: inner_value.id
                                    };
                                })
                            }
                        })
                        .value();
                    self.workerProjectsRaw = projects;
                },
                function error(response) {
                    $mdToast.showSimple('Could not get tasks.');
                }
            ).finally(function () {
            });
        }

        function moveUp($index) {
            if ($index == 0) {
                return;
            }
            var temp = self.workerRequesters[$index - 1];
            self.workerRequesters[$index - 1] = self.workerRequesters[$index];
            self.workerRequesters[$index] = temp;
        }

        function moveDown($index) {
            if ($index + 1 == self.workerRequesters.length) {
                return;
            }
            var temp = self.workerRequesters[$index + 1];
            self.workerRequesters[$index + 1] = self.workerRequesters[$index];
            self.workerRequesters[$index] = temp;
        }

        function submitRankings() {
            var ratedCount = 0;
            var request_data = self.workerRequesters.map(function (value, index) {
                if (value.rating == null || value.rating == undefined) ratedCount++;
                return {
                    requester: value.requester_id,
                    rank: value.rating
                };
            });
            if (ratedCount > 0) {
                $mdToast.showSimple('Please answer for all requesters.');
                return;
            }
            Project.submitRankings(request_data).then(
                function success(data) {
                    self.rankingsSubmitted = true;
                },
                function error(errData) {
                    $mdToast.showSimple('Please retry, something went wrong.');
                }
            ).finally(function () {
            });
        }

        function gotIt($event) {
            $event.preventDefault();
            User.updatePreferences(userAccount.username, {'has_read_tooltip_feed': true}).then(
                function () {
                    self.has_read_tooltip = true;
                });
        }

        function getRateText(rate) {
            if (rate <= 3) {
                return 'low';
            }
            else if (rate >= 10 && rate <= 20) {
                return 'medium';
            }
            else {
                return 'high';
            }
        }

        function requesterRatingLabel(rating) {
            if (!rating) return 'not rated';
            if (rating == 2) return 'ok';
            else if (rating == 1) return 'disliked';
            else if (rating == 3) return 'liked it';
        }

        function postChoices() {
            var sample = [];
            angular.forEach(self.sampled_requesters, function (obj) {
                sample.push(obj.requester_id);
            });
            Project.postChoices(sample, self.pick).then(
                function success(data) {
                    self.pick = null;
                    self.round++;
                    sampleRequesters();

                },
                function error(errData) {
                    //$mdToast.showSimple('Please retry, something went wrong.');
                }
            ).finally(function () {
            });
        }

        function sampleRequesters() {
            Project.sampleRequesters().then(
                function success(data) {
                    self.sampled_requesters = data[0].data;
                    self.sampled_requesters = _
                        .chain(self.sampled_requesters)
                        .groupBy('owner_id')
                        .map(function (value, key) {
                            return {
                                requester_id: key,
                                requester_name: value[0].owner.alias,
                                project_names: _.pluck(value, 'name'),
                                projects: value.map(function (inner_value, inner_key) {
                                    return {
                                        name: inner_value.name,
                                        project_id: inner_value.id
                                    };
                                })
                            }
                        })
                        .value();
                    self.round = data[0].round;
                },
                function error(errData) {
                    //$mdToast.showSimple('Please retry, something went wrong.');
                }
            ).finally(function () {
            });
        }
    }

})
();
