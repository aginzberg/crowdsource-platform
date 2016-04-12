(function () {
    'use strict';

    angular
        .module('crowdsource.project.controllers')
        .controller('MyTasksController', MyTasksController);

    MyTasksController.$inject = ['$scope', 'Project', 'Task', '$mdToast',
        '$filter', 'RatingService', '$state', '$stateParams', 'User'];

    /**
     * @namespace MyTasksController
     */
    function MyTasksController($scope, Project, Task, $mdToast, $filter, RatingService, $state, $stateParams, User) {
        var self = this;
        self.projects = [];
        self.loading = true;
        self.isSelected = isSelected;
        self.selectedProject = null;
        self.setSelected = setSelected;
        self.getStatus = getStatus;
        self.listMyTasks = listMyTasks;
        self.setRating = setRating;
        self.filterByStatus = filterByStatus;
        self.dropSavedTasks = dropSavedTasks;
        self.reject = reject;
        self.acceptRest = acceptRest;
        self.showText = false;
        self.done = false;
        self.getRating = getRating;
        self.nextStep = nextStep;
        self.pick = null;
        self.sampled_workers = [];
        self.postChoices = postChoices;
        self.round = 0;

        self.tasks = [];
        self.status = {
            RETURNED: 5,
            REJECTED: 4,
            ACCEPTED: 3,
            SUBMITTED: 2,
            IN_PROGRESS: 1,
            SKIPPED: 6
        };

        self.conditions = {
            "x7JAz90L": 1,
            "0ReR2I9z": 2,
            "R1yPIczm": 2
        };
        activate();
        function activate() {
            if ($state.current.name == 'requester-study-r') {
                getRequesterConfig();
                getWorkerRatings();
                loadRequesterReputationStudy();
                return;
            }
            Project.listWorkerProjects().then(
                function success(response) {
                    self.loading = false;
                    self.projects = response[0];
                    loadFirst();
                },
                function error(response) {
                    $mdToast.showSimple('Could not get tasks.');
                }
            ).finally(function () {
            });
        }

        function loadFirst() {
            if (self.projects.length) {
                listMyTasks(self.projects[0]);
            }
        }

        function isSelected(project) {
            return angular.equals(project, self.selectedProject);
        }

        function setSelected(item) {
            if (angular.equals(item, self.selectedProject)) {
                return null;
            }
            else {
                self.listMyTasks(item);
            }
        }

        function loadRequesterStudy(requester_id) {
            Project.loadRequesterStudy().then(
                function success(response) {
                    self.tasks = response[0];
                },
                function error(response) {
                    $mdToast.showSimple('Could fetch project submissions');
                }
            ).finally(function () {
            });
        }

        function loadRequesterReputationStudy(requester_id) {
            Project.loadRequesterReputationStudy().then(
                function success(response) {
                    self.tasks = response[0];
                    self.loading = false;
                },
                function error(response) {
                    $mdToast.showSimple('Could fetch project submissions');
                }
            ).finally(function () {
            });
        }

        function reject(assignment) {
            Project.reject(assignment.id).then(
                function success(response) {
                    assignment.review = response[0];
                },
                function error(response) {
                    $mdToast.showSimple('Could fetch project submissions');
                }
            ).finally(function () {
            });
        }

        function acceptRest() {
            var assignmentToAccept = [];
            angular.forEach(self.tasks, function (task) {
                angular.forEach(task.assignments, function (assignment) {
                    if (assignment.review == null) {
                        assignmentToAccept.push(assignment.id);
                    }
                });
            });
            Project.acceptRest(assignmentToAccept).then(
                function success(response) {
                    self.done = true;

                },
                function error(response) {
                    $mdToast.showSimple('Could fetch project submissions');
                }
            ).finally(function () {
            });
        }

        function getStatus(statusId) {
            for (var key in self.status) {
                if (self.status.hasOwnProperty(key)) {
                    if (statusId == self.status[key])
                        return key;
                }

            }
        }

        function listMyTasks(project) {
            Task.listMyTasks(project.id).then(
                function success(response) {
                    self.tasks = response[0].tasks;
                    self.selectedProject = project;
                    RatingService.listByTarget(project.owner.profile, 'worker').then(
                        function success(response) {
                            self.selectedProject.rating = response[0];
                        },
                        function error(response) {
                            $mdToast.showSimple('Could requester rating');
                        }
                    ).finally(function () {
                    });
                },
                function error(response) {
                    $mdToast.showSimple('Could fetch project tasks');
                }
            ).finally(function () {
            });
        }

        function setRating(target_id, weight) {
            var rating = getRating(target_id);
            if (rating && rating.hasOwnProperty('id') && rating.id) {
                RatingService.updateRating(weight, rating).then(function success(resp) {
                    rating.weight = weight;
                }, function error(resp) {
                    $mdToast.showSimple('Could not update rating.');
                }).finally(function () {

                });
            } else {
                RatingService.submitRating(weight, rating).then(function success(resp) {
                    self.workerRatings.push(resp[0]);
                }, function error(resp) {
                    $mdToast.showSimple('Could not submit rating.')
                }).finally(function () {

                });
            }
        }

        function filterByStatus(status) {
            return $filter('filter')(self.tasks, {'task_status': status})
        }

        function dropSavedTasks(task) {
            var request_data = {
                task_ids: [task.task]
            };
            Task.dropSavedTasks(request_data).then(function success(resp) {
                task.task_status = self.status.SKIPPED;
                $mdToast.showSimple('Task ' + task.task + ' released');
            }, function error(resp) {
                $mdToast.showSimple('Could drop tasks')
            }).finally(function () {
            });
        }

        function getRequesterConfig() {
            User.getRequesterConfiguration().then(function (data) {
                self.requester_config = data[0];
                if (self.requester_config.condition == 2 || self.requester_config.condition == 1) {
                    self.showText = true;
                    self.tooltipBoomerangThree = "Like: grant this worker early access to my tasks, so they do a lot of my work";
                    self.tooltipBoomerangTwo = "Default: give this worker access at the same time as normal workers, so they do a bit of my work";
                    self.tooltipBoomerangOne = "Bury: prevent this worker from getting access to my tasks until last, so they rarely do my work";
                }
                else {
                    self.tooltipBoomerangOne = "I dont like this";
                    self.tooltipBoomerangTwo = "Neutral";
                    self.tooltipBoomerangThree = "I like this";
                }
                if (self.requester_config.phase > 3) {
                    sampleWorkers();
                }
            });
        }

        function getWorkerRatings() {
            RatingService.listByOrigin().then(function (data) {
                self.workerRatings = data[0];
            });
        }

        function getRating(target_id) {
            //console.log(target_id);
            var r = $filter('filter')(self.workerRatings, {'target': target_id}, true);
            //console.log(r);
            if (r.length) {
                return r[0];
            }
            return {"origin_type": "requester", "target": target_id};
        }

        function nextStep() {
            self.submit = true;
            angular.forEach(self.tasks, function (obj) {
                angular.forEach(obj.results, function (inner_obj) {
                    var r = getRating(inner_obj.worker.profile);
                    if (r && r.hasOwnProperty('id') && r.id) {
                    }
                    else {
                        self.submit = false;
                    }
                });
            });
            if (!self.submit) {
                $mdToast.showSimple('Please rate all workers!');
                return;
            }
            Project.nextPhase().then(function (data) {
                self.tasks = [];
                self.loading = true;
                activate();
            });
        }

        function sampleWorkers() {
            Project.sampleWorkers().then(
                function success(data) {
                    self.sampled_workers = data[0].data;
                    self.round = data[0].round;
                },
                function error(errData) {
                }
            ).finally(function () {
            });
        }

        function postChoices() {
            var sample = [];
            angular.forEach(self.sampled_workers, function (obj) {
                sample.push(obj.id);
            });
            Project.postChoices(sample, self.pick).then(
                function success(data) {
                    self.pick = null;
                    self.round++;
                    sampleWorkers();

                },
                function error(errData) {
                    //$mdToast.showSimple('Please retry, something went wrong.');
                }
            ).finally(function () {
            });
        }
    }
})();
