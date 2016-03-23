/**
 * LoginController
 * @namespace crowdsource.authentication.controllers
 */
(function () {
    'use strict';

    angular
        .module('crowdsource.authentication.controllers')
        .controller('LoginController', LoginController);

    LoginController.$inject = ['$window', '$state', '$scope', 'Authentication', '$stateParams'];

    /**
     * @namespace LoginController
     */
    function LoginController($window, $state, $scope, Authentication, $stateParams) {
        var vm = this;

        vm.login = login;
        vm.Authentication = Authentication;
        vm.tokenAuth = tokenAuth;

        activate();

        /**
         * @name activate
         * @desc Actions to be performed when this controller is instantiated
         * @memberOf crowdsource.authentication.controllers.LoginController
         */
        function activate() {
            // If the user is authenticated, they should not be here.
            if (Authentication.isAuthenticated()) {
                $state.go('task_feed');
            }

            if ($state.current.name == 'feed-init') {
                tokenAuth();
            }
        }

        /**
         * @name login
         * @desc Log the user in
         * @memberOf crowdsource.authentication.controllers.LoginController
         */
        function login(isValid) {
            if (isValid) {
                Authentication.login(vm.username, vm.password).then(function success(data, status) {
                    Authentication.setAuthenticatedAccount(data.data);

                    $scope.$watch(Authentication.isAuthenticated, function (newValue, oldValue) {
                        if (newValue) {
                            $state.go('task_feed');
                        }
                    });

                }, function error(data, status) {
                    vm.error = data.data.detail;
                    $scope.loginForm.$setPristine();

                }).finally(function () {
                });
            }
            vm.submitted = true;
        }

        function tokenAuth() {
            var token = $stateParams.token;
            Authentication.login(vm.username, vm.password, token).then(function success(data, status) {
                Authentication.setAuthenticatedAccount(data.data);

                $scope.$watch(Authentication.isAuthenticated, function (newValue, oldValue) {
                    if (newValue) {
                        $state.go('task_feed');
                    }
                });

            }, function error(data, status) {
                vm.error = 'Set up failed, please try again, if that does not work you may return the HIT.';

            }).finally(function () {
            });
        }
    }
})();
