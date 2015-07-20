/**
* TaskFeedController
* @namespace crowdsource.template.controllers
 * @author dmorina
*/
(function () {
  'use strict';

  angular
    .module('crowdsource.template.controllers')
    .controller('TemplateController', TemplateController);

    TemplateController.$inject = ['$window', '$location', '$scope', 'Template', '$filter', '$sce',
      'Project', 'Authentication'];

  /**
  * @namespace TemplateController
  */
  function TemplateController($window, $location, $scope, Template, $filter, $sce,
    Project, Authentication) {
    var self = this;
    self.userAccount = Authentication.getAuthenticatedAccount();
    if (!self.userAccount) {
      $location.path('/login');
      return;
    }

    var idGenIndex = 0;
    
    // Retrieve from service if possible.
    $scope.project.currentProject = Project.retrieve();
    if ($scope.project.currentProject.template) {
      self.templateName = $scope.project.currentProject.template.name || generateRandomTemplateName();  
      self.items = $scope.project.currentProject.template.items || [];
    } else {
      self.templateName = generateRandomTemplateName();
      self.items = [];
    }

    self.templateComponents = {
        'label': {
          id_string: 1,
          name: 'label' + 1,
          type: 'label',
          width: 100,
          height: 100,
          values: 'Label 1',
          role: 'display',
          sub_type: 'h4',
          layout: 'column',
          icon: null,
          data_source: null
        },
        'image': {
          id_string: 1,
          name: 'image' + 1,
          type: 'image',
          width: 100,
          height: 100,
          values: null,
          role: 'display',
          sub_type: 'div',
          layout: 'column',
          icon: '/static/bower_components/material-design-icons/image/svg/production/ic_panorama_24px.svg',
          data_source: null
        },
        'checkbox': {
          id_string: 1,
          name: 'select_control' + 1,
          type: 'select_control',
          width: 100,
          height: 100,
          values: 'Option 1',
          role: 'display',
          sub_type: 'div',
          layout: 'column',
          icon: null,
          data_source: null
        },
        'text_area': {
          id_string: 1,
          name: 'text_area_placeholder' + 1,
          type: 'text_area',
          width: 100,
          height: 100,
          values: null,
          role: 'display',
          sub_type: 'div',
          layout: 'column',
          data_source: null
        },
        'text_field': {
          id_string: 1,
          name: 'text_field_placeholder' + 1,
          type: 'text_field',
          width: 100,
          height: 100,
          values: null,
          role: 'display',
          sub_type: 'div',
          layout: 'column',
          data_source: null
        },
        'radio': {
          id_string: 1,
          name: 'select_placeholder' + 1,
          type: 'radio',
          width: 100,
          height: 100,
          values: null,
          role: 'display',
          sub_type: 'div',
          layout: 'column',
          data_source: null
        }
    };

    self.templateName = $scope.project.currentProject.templateName;
    if(self.templateName == 'Proofread or edit a document' || self.templateName == 'Translate a document') {
      self.items = [self.templateComponents['label'], self.templateComponents['text_area']];
      if(self.templateName == 'Proofread or edit a document') {
        self.items[0].values = 'E.g. Please proofread the first two paragraphs of my '
                                + 'document looking for spelling and grammatical mistakes.'
                                + ' Enter your revised version in the textbox below.';
      } else if(self.templateName == 'Translate a document') {
        self.items[0].values = 'E.g. Please translate the first three paragraphs of my '
                                + 'document. Enter the translation in the textbox below.';
      }
    } else if(self.templateName == 'Image labelling') {
      self.items = [self.templateComponents['label'], self.templateComponents['image'], self.templateComponents['text_field']]
      self.items[0].values = 'E.g. Please enter the hair color of the person in the image in the text field below';
      self.items[1].icon = 'static/images/placeholder.jpg'
    } else if(self.templateName == 'Design a logo') {
      // self.items = [self.templateComponents['label'], self.templateComponents['text_area']];
    } else if(self.templateName == 'Create a website') {

    } else if(self.templateName == 'Run an experiment') {
      self.items = [self.templateComponents['label'], self.templateComponents['text_field']];
      self.items[0].values = 'E.g. Please follow the link to my survey and answer the questions. Then '
                             + 'paste the confirmation code in the textfield below.';
    }
    sync();

    $scope.$watch('template.items', function (newval, oldval) {
      if(newval[0].values == undefined) self.items[0].values = "";
    }, true);

    self.selectedTab = 0;
    self.buildHtml = buildHtml;
    self.setSelectedItem = setSelectedItem;
    self.removeItem = removeItem;
    self.selectedItem = null;
    $scope.onOver = onOver;
    $scope.onDrop = onDrop;

    function buildHtml(item) {
      var html = '';
      if (item.type === 'label') {
        html = '<' + item.sub_type + '>' + item.values + '</' + item.sub_type + '>';
      }
      else if (item.type === 'image') {
        html = '<img class="image-container" src="'+item.icon+'">'+'</img>';
        // html = '<md-icon class="image-container" md-svg-src="' + item.icon + '"></md-icon>';
      }
      else if (item.type === 'radio') {
        html = '<md-radio-group class="template-item" ng-model="item.answer" layout="' + item.layout + '">' +
            '<md-radio-button ng-repeat="option in item.values.split(\',\')" value="{{option}}">{{option}}</md-radio-button>';
      }
      else if (item.type === 'checkbox') {
        html = '<div  layout="' + item.layout + '" layout-wrap><div class="template-item" ng-repeat="option in item.values.split(\',\')" >' +
            '<md-checkbox> {{ option }}</md-checkbox></div></div> ';
      } else if (item.type === 'text_area') {
        html = '<md-input-container><textarea class="template-item" ng-model="item.answer" layout="' + item.layout + '"></textarea></md-input-container>';
      } else if (item.type === 'text_field') {
        html = '<md-input-container><input type="text" class="template-item" ng-model="item.answer" layout="' + item.layout + '"/></md-input-container>';
      } else if (item.type === 'select') {
        html = '<md-select class="template-item" ng-model="item.answer" layout="' + item.layout + '">' +
            '<md-option ng-repeat="option in item.values.split(\',\')" value="{{option}}">{{option}}</md-option></md-select>'; 
      }
      return $sce.trustAsHtml(html);
    }

    function setSelectedItem(item) {
      self.selectedItem = item;
      self.selectedTab = 1;
    }

    function removeItem(item) {
      for (var i = 0; i < self.items.length; i++) {
        if (self.items[i].id_string === item.id_string) {
          self.items.splice(i, 1);
          break;
        }
      }
      sync();
    }

    function onDrop(event, ui) {
      var item_type = $(ui.draggable).attr('data-type');
      var curId = generateId();
      if(item_type==='label') {
        var item = {
          id_string: curId,
          name: 'label' + curId,
          type: item_type,
          width: 100,
          height: 100,
          values: 'Label 1',
          role: 'display',
          sub_type: 'h4',
          layout: 'column',
          icon: null,
          data_source: null
        };
        self.items.push(item);
      }
      else if(item_type==='image') {
        var item = {
          id_string: curId,
          name: 'image_placeholder' + curId,
          type: item_type,
          width: 100,
          height: 100,
          values: null,
          role: 'display',
          sub_type: 'div',
          layout: 'column',
          icon: '/static/bower_components/material-design-icons/image/svg/production/ic_panorama_24px.svg',
          data_source: null
        };
        self.items.push(item);
      }
      else if(item_type==='radio'||item_type==='checkbox') {
        var item = {
          id_string: curId,
          name: 'select_control' + curId,
          type: item_type,
          width: 100,
          height: 100,
          values: 'Option 1',
          role: 'display',
          sub_type: 'div',
          layout: 'column',
          icon: null,
          data_source: null
        };
        self.items.push(item);

      } else if (item_type === 'text_area') {

        var item = {
          id_string: curId,
          name: 'text_area_placeholder' + curId,
          type: item_type,
          width: 100,
          height: 100,
          values: null,
          role: 'display',
          sub_type: 'div',
          layout: 'column',
          data_source: null
        };
        self.items.push(item);

      } else if (item_type === 'text_field') {

        var item = {
          id_string: curId,
          name: 'text_field_placeholder' + curId,
          type: item_type,
          width: 100,
          height: 100,
          values: null,
          role: 'display',
          sub_type: 'div',
          layout: 'column',
          data_source: null
        };
        self.items.push(item);

      } else if (item_type === 'select') {

        var item = {
          id_string: curId,
          name: 'select_placeholder' + curId,
          type: item_type,
          width: 100,
          height: 100,
          values: null,
          role: 'display',
          sub_type: 'div',
          layout: 'column',
          data_source: null
        };
        self.items.push(item);
      }
      sync();
    }

    function onOver(event, ui) {
      console.log('onOver');
    }

    function generateId() {
      return 'id' + ++idGenIndex;
    }

    function generateRandomTemplateName() {
      var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      var random = _.sample(possible, 8).join('');
      return 'template_' + random;
    }

    function sync() {
      $scope.project.currentProject.template = {
        name: self.templateName,
        items: self.items
      }
    }

    $scope.$on("$destroy", function() {
      Project.syncLocally($scope.project.currentProject);
    });
  }
  
})();