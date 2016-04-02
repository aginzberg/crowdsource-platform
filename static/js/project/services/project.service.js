/**
 * Project
 * @namespace crowdsource.project.services
 * @author dmorina neilthemathguy
 */
(function () {
    'use strict';

    angular
        .module('crowdsource.project.services')
        .factory('Project', Project);

    Project.$inject = ['$cookies', '$http', '$q', 'HttpService'];

    /**
     * @namespace Project
     * @returns {Factory}
     */

    function Project($cookies, $http, $q, HttpService) {
        /**
         * @name Project
         * @desc The Factory to be returned
         */

        var Project = {
            retrieve: retrieve,
            getRequesterProjects: getRequesterProjects,
            create: create,
            update: update,
            deleteInstance: deleteInstance,
            attachFile: attachFile,
            deleteFile: deleteFile,
            fork: fork,
            getProjectComments: getProjectComments,
            listWorkerProjects: listWorkerProjects,
            getPreview: getPreview,
            submitRankings: submitRankings,
            loadRequesterStudy: loadRequesterStudy,
            reject: reject,
            acceptRest: acceptRest
        };

        return Project;
        /**
         * @name create
         * @desc Create a new Project
         * @returns {Promise}
         * @memberOf crowdsource.project.services.Project
         */
        function create() {
            var settings = {
                url: '/api/project/',
                method: 'POST'
            };
            return HttpService.doRequest(settings);
        }

        /**
         * @name update
         * @desc Update an existing project
         * @returns {Promise}
         * @memberOf crowdsource.project.services.Project
         */
        function update(pk, data, path) {
            var settings = {
                url: '/api/' + path + '/' + pk + '/',
                method: 'PUT',
                data: data
            };
            return HttpService.doRequest(settings);
        }

        function retrieve(pk) {
            var settings = {
                url: '/api/project/' + pk + '/',
                method: 'GET'
            };
            return HttpService.doRequest(settings);
        }

        function deleteInstance(pk) {
            var settings = {
                url: '/api/project/' + pk + '/',
                method: 'DELETE'
            };
            return HttpService.doRequest(settings);
        }

        function getRequesterProjects() {
            var settings = {
                url: '/api/project/requester_projects/',
                method: 'GET'
            };
            return HttpService.doRequest(settings);
        }


        function attachFile(pk, data) {
            var settings = {
                url: '/api/project/' + pk + '/attach_file/',
                method: 'POST',
                data: data
            };
            return HttpService.doRequest(settings);
        }

        function deleteFile(pk, data) {
            var settings = {
                url: '/api/project/' + pk + '/delete_file/',
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                data: data
            };
            return HttpService.doRequest(settings);
        }

        function fork(pk) {
            var settings = {
                url: '/api/project/' + pk + '/fork/',
                method: 'POST'
            };
            return HttpService.doRequest(settings);
        }

        function getProjectComments(project_id) {
            var settings = {
                url: '/api/project/' + project_id + '/list_comments/',
                method: 'GET'
            };
            return HttpService.doRequest(settings);
        }

        function listWorkerProjects() {
            var settings = {
                url: '/api/project/worker_projects/',
                method: 'GET'
            };
            return HttpService.doRequest(settings);
        }

        function getPreview(project_id) {
            var settings = {
                url: '/api/project/' + project_id + '/get_preview/',
                method: 'GET'
            };
            return HttpService.doRequest(settings);
        }

        function submitRankings(rankings) {
            var settings = {
                url: '/api/project/submit-rankings/',
                method: 'POST',
                data: {
                    rankings: rankings
                }
            };
            return HttpService.doRequest(settings);
        }

        function loadRequesterStudy(requester_id) {
            var settings = {
                url: '/api/requester-study/?requester_id='+requester_id,
                method: 'GET'
            };
            return HttpService.doRequest(settings);
        }

        function reject(assignmentId, requesterId) {
            var settings = {
                url: '/api/requester-study/reject/',
                method: 'POST',
                data: {
                    assignment_id: assignmentId,
                    requester_id: requesterId
                }
            };
            return HttpService.doRequest(settings);
        }

        function acceptRest(assignments, requesterId) {
            var settings = {
                url: '/api/requester-study/accept_rest/',
                method: 'POST',
                data: {
                    assignments: assignments,
                    requester_id: requesterId
                }
            };
            return HttpService.doRequest(settings);
        }

    }
})();
