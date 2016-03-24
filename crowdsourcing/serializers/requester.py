from crowdsourcing import models
from rest_framework import serializers
from crowdsourcing.serializers.dynamic import DynamicFieldsModelSerializer


class RequesterSerializer(DynamicFieldsModelSerializer):
    # user_id = serializers.SerializerMethodField()

    class Meta:
        model = models.Requester
        fields = ('id', 'alias', 'profile', 'rejection_rate')


class QualificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Qualification
        fields = ('project', 'types', 'type', 'created_timestamp', 'last_updated')
        read_only_fields = ('project', 'types', 'created_timestamp', 'last_updated')
