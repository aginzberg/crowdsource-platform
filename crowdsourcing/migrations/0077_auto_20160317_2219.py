# -*- coding: utf-8 -*-
# Generated by Django 1.9 on 2016-03-17 22:19
from __future__ import unicode_literals

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crowdsourcing', '0076_requesterconfig'),
    ]

    operations = [
        migrations.AlterField(
            model_name='requester',
            name='rejection_rate',
            field=models.FloatField(default=None, null=True),
        ),
    ]
