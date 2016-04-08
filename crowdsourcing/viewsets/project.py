import random
from rest_framework import status, viewsets
from rest_framework.decorators import detail_route, list_route
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Q

from crowdsourcing.models import Category, Project, Task, TaskWorker
from crowdsourcing.permissions.project import IsProjectOwnerOrCollaborator
from crowdsourcing.serializers.project import *
from crowdsourcing.serializers.task import *


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.filter(deleted=False)
    serializer_class = CategorySerializer

    @detail_route(methods=['post'])
    def update_category(self, request, id=None):
        category_serializer = CategorySerializer(data=request.data)
        category = self.get_object()
        if category_serializer.is_valid():
            category_serializer.update(category, category_serializer.validated_data)

            return Response({'status': 'updated category'})
        else:
            return Response(category_serializer.errors,
                            status=status.HTTP_400_BAD_REQUEST)

    def list(self, request, *args, **kwargs):
        try:
            category = self.queryset
            categories_serialized = CategorySerializer(category, many=True)
            return Response(categories_serialized.data)
        except:
            return Response([])

    def destroy(self, request, *args, **kwargs):
        category_serializer = CategorySerializer()
        category = self.get_object()
        category_serializer.delete(category)
        return Response({'status': 'deleted category'})


class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.filter(deleted=False)
    serializer_class = ProjectSerializer
    permission_classes = [IsProjectOwnerOrCollaborator, IsAuthenticated]

    def create(self, request, *args, **kwargs):
        project_serializer = ProjectSerializer()
        data = project_serializer.create(owner=request.user.userprofile)
        response_data = {
            "id": data.id
        }
        return Response(data=response_data, status=status.HTTP_200_OK)

    def retrieve(self, request, *args, **kwargs):
        project_object = self.get_object()
        serializer = ProjectSerializer(instance=project_object,
                                       fields=('id', 'name', 'price', 'repetition', 'deadline', 'timeout',
                                               'is_prototype', 'templates', 'status', 'batch_files',
                                               'post_mturk'),
                                       context={'request': request})

        return Response(data=serializer.data, status=status.HTTP_200_OK)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        project_serializer = ProjectSerializer(instance=instance, data=request.data, partial=True)
        if project_serializer.is_valid():
            with transaction.atomic():
                project_serializer.update()
            return Response(data={"message": "Project updated successfully"}, status=status.HTTP_200_OK)
        else:
            return Response(data=project_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        project_serializer = ProjectSerializer(instance=instance)
        project_serializer.delete(instance)
        return Response(data={"message": "Project deleted successfully"}, status=status.HTTP_204_NO_CONTENT)

    @detail_route(methods=['get'])
    def list_comments(self, request, **kwargs):
        comments = models.ProjectComment.objects.filter(project=kwargs['pk'])
        serializer = ProjectCommentSerializer(instance=comments, many=True, fields=('comment', 'id',))
        response_data = {
            'project': kwargs['pk'],
            'comments': serializer.data
        }
        return Response(response_data, status.HTTP_200_OK)

    @detail_route(methods=['post'])
    def post_comment(self, request, **kwargs):
        serializer = ProjectCommentSerializer(data=request.data)
        project_comment_data = {}
        if serializer.is_valid():
            comment = serializer.create(project=kwargs['pk'], sender=request.user.userprofile)
            project_comment_data = ProjectCommentSerializer(comment, fields=('id', 'comment',)).data

        return Response(project_comment_data, status.HTTP_200_OK)

    @list_route(methods=['get'], url_path='worker_projects')
    def worker_projects(self, request, *args, **kwargs):
        query = '''
            SELECT
                DISTINCT p.id, p.name, r.alias owner_name, p.owner_id
            FROM crowdsourcing_taskworker tw
              INNER JOIN crowdsourcing_task t ON tw.task_id = t.id
              INNER JOIN crowdsourcing_worker w ON tw.worker_id = w.id
              INNER JOIN crowdsourcing_project p ON t.project_id = p.id
              INNER JOIN crowdsourcing_requester r ON r.id = p.owner_id
            WHERE tw.worker_id = %(worker_id)s AND task_status<>6;
        '''
        projects = Project.objects.raw(query, params={'worker_id': request.user.userprofile.worker.id})
        serializer = ProjectSerializer(instance=projects, many=True,
                                       fields=('id', 'name', 'owner', 'owner_id'),
                                       context={'request': request})
        return Response(data=serializer.data, status=status.HTTP_200_OK)

    @list_route(methods=['get'])
    def list_feed(self, request, **kwargs):
        from django.utils.timezone import utc
        last_login = request.user.last_login
        now = datetime.utcnow().replace(tzinfo=utc)
        condition = -1
        phase = 1
        if hasattr(request.user.userprofile.worker, 'configuration'):
            condition = request.user.userprofile.worker.configuration.condition
            phase = request.user.userprofile.worker.configuration.phase
            phase_updated = request.user.userprofile.worker.configuration.phase_changed

            if phase_updated is not None and (now - phase_updated).total_seconds() / 60 >= settings.STUDY_FEED_TIME \
                and phase == 3:
                return Response(data={"message": "Time is up, thank you so much, your code is ZPY1687QG, "
                                                 "you may close this window now!"},
                                status=status.HTTP_410_GONE)

        query_factor = '''
            SELECT avg(p.ratio) id
            FROM (
                   SELECT
                     t.id task_id,
                     CASE WHEN tw.completion_time / two.completion_time IS NULL
                       THEN 1.0
                     ELSE tw.completion_time / two.completion_time END ratio,
                     two.completion_time completion_time
                   FROM crowdsourcing_task t
                     LEFT OUTER JOIN crowdsourcing_taskworker tw ON tw.task_id = t.id
                             AND tw.task_status IN (2, 3) AND tw.worker_id = %(worker_id)s AND
                             tw.completion_time IS NOT NULL
                     LEFT OUTER JOIN (SELECT
                                        task_id,
                                        avg(completion_time) completion_time
                                      FROM crowdsourcing_taskworker two
                                      WHERE two.task_status IN (2, 3) AND two.completion_time IS NOT NULL
                                      GROUP BY task_id) two ON two.task_id = t.id
            ) p;
        '''
        worker_id = request.user.userprofile.worker.id
        factor = 1.0 # models.Worker.objects.raw(query_factor, params={'worker_id': worker_id})[0].id

        extra_query = ''
        if phase == -1:
            extra_query = ' inner join (select px.owner_id, max(px.id) id from ' \
                          'crowdsourcing_project px GROUP BY px.owner_id) px on px.id=cp.id '
        query = '''
            WITH projects AS (
                SELECT
                  ratings.project_id,
                  ratings.min_rating new_min_rating,
                  requester_ratings.requester_rating,
                  requester_ratings.raw_rating
                FROM get_min_project_ratings() ratings
                  LEFT OUTER JOIN (SELECT requester_id, requester_rating AS raw_rating,
                                    CASE WHEN requester_rating IS NULL AND requester_avg_rating
                                        IS NOT NULL THEN 1.99 --requester_avg_rating
                                    WHEN requester_rating IS NULL AND requester_avg_rating IS NULL THEN 1.99
                                    WHEN requester_rating IS NOT NULL AND requester_avg_rating IS NULL
                                    THEN requester_rating
                                    ELSE requester_rating + 0.1 * requester_avg_rating END requester_rating
                                   FROM get_requester_ratings(%(worker_profile)s)) requester_ratings
                    ON requester_ratings.requester_id = ratings.owner_id
                  )
            SELECT cp.id, cp.name, p.raw_rating, p.requester_rating, r.alias owner_name, r.rejection_rate rejection_rate,
             cp.owner_id, cp.is_prototype, cp.price, cp.task_time, available_projects.available_tasks
             FROM projects p
        INNER JOIN crowdsourcing_project cp ON p.project_id= cp.id and cp.owner_id in (58, 59, 68, 70, 71, 61, 62) ''' + extra_query +\
                ''' INNER JOIN crowdsourcing_requester r ON r.id = cp.owner_id
        INNER JOIN (SELECT
                        project_id,
                        sum(available_tasks) available_tasks
                      FROM (
                             SELECT
                               t.project_id,
                               t.id,
                               CASE WHEN count(DISTINCT twd.id) < p.repetition AND count(DISTINCT tw.id) = 0
                                 THEN 1
                               ELSE 0 END available_tasks
                             FROM crowdsourcing_project p INNER JOIN crowdsourcing_task t ON p.id = t.project_id
                               LEFT OUTER JOIN crowdsourcing_taskworker tw
                                 ON t.id = tw.task_id AND tw.worker_id = %(worker_id)s AND tw.task_status NOT IN (4, 6)
                               LEFT OUTER JOIN crowdsourcing_taskworker twd
                                 ON t.id = twd.task_id AND tw.worker_id <> %(worker_id)s AND tw.task_status NOT IN (4, 6)
                             GROUP BY t.project_id, t.id, p.repetition) projects WHERE projects.available_tasks>0
                      GROUP BY projects.project_id
                ) available_projects ON available_projects.project_id=p.project_id
        ORDER BY CASE WHEN %(worker_condition)s < 3 THEN  p.requester_rating ELSE p.project_id END DESC;
        '''
        projects = Project.objects.raw(query, params={'worker_profile': request.user.userprofile.id,
                                                      'worker_id': worker_id, 'worker_condition': condition})
        project_serializer = ProjectSerializer(instance=projects, many=True,
                                               fields=('id', 'name',
                                                       'status',
                                                       'available_tasks',
                                                       'price', 'task_time',
                                                       'owner_name',
                                                       'requester_rating',
                                                       'raw_rating',
                                                       'is_prototype',
                                                       'rejection_rate',
                                                       # 'completion_time'
                                                       ),
                                               context={'request': request, 'factor': factor})
        has_read_tooltip_feed = request.user.preferences.has_read_tooltip_feed or False
        return Response(data={'projects': project_serializer.data, 'has_read_tooltip_feed': has_read_tooltip_feed},
                        status=status.HTTP_200_OK)

    @detail_route(methods=['post'])
    def attach_file(self, request, **kwargs):
        serializer = ProjectBatchFileSerializer(data=request.data, fields=('batch_file',))
        if serializer.is_valid():
            project_file = serializer.create(project=kwargs['pk'])
            file_serializer = ProjectBatchFileSerializer(instance=project_file)
            return Response(data=file_serializer.data, status=status.HTTP_201_CREATED)
        else:
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @detail_route(methods=['delete'])
    def delete_file(self, request, **kwargs):
        batch_file = request.data.get('batch_file', None)
        instances = models.ProjectBatchFile.objects.filter(batch_file=batch_file)
        if instances.count() == 1:
            models.BatchFile.objects.filter(id=batch_file).delete()
        else:
            models.ProjectBatchFile.objects.filter(batch_file_id=batch_file, project_id=kwargs['pk']).delete()
        return Response(data={}, status=status.HTTP_204_NO_CONTENT)

    @list_route(methods=['GET'])
    def requester_projects(self, request, **kwargs):
        projects = request.user.userprofile.requester.project_owner.all().filter(deleted=False). \
            order_by('-created_timestamp')
        serializer = ProjectSerializer(instance=projects, many=True,
                                       fields=('id', 'name', 'age', 'total_tasks', 'status'),
                                       context={'request': request})
        return Response(serializer.data)

    @detail_route(methods=['post'])
    def fork(self, request, **kwargs):
        instance = self.get_object()
        project_serializer = ProjectSerializer(instance=instance, data=request.data, partial=True,
                                               fields=('id', 'name', 'price', 'repetition',
                                                       'is_prototype', 'templates', 'status', 'batch_files'))
        if project_serializer.is_valid():
            with transaction.atomic():
                project_serializer.fork()
            return Response(data=project_serializer.data, status=status.HTTP_200_OK)
        else:
            return Response(data=project_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @detail_route(methods=['get'], permission_classes=[IsAuthenticated])
    def get_preview(self, request, *args, **kwargs):
        project = self.get_object()
        task = Task.objects.filter(project=project).first()
        task_serializer = TaskSerializer(instance=task, fields=('id', 'template'))
        return Response(data=task_serializer.data, status=status.HTTP_200_OK)

    @list_route(methods=['post'], url_path='submit-rankings')
    def submit_rankings(self, request, *args, **kwargs):
        from django.utils import timezone
        ranking_data = request.data.get('rankings', [])
        models.RequesterFeedRankings.objects.filter(worker=request.user.userprofile.worker).delete()
        ranking_obj = []
        now = timezone.now()
        for ranking in ranking_data:
            ranking_obj.append(models.RequesterFeedRankings(worker=request.user.userprofile.worker,
                                                            requester_id=ranking['requester'], rank=ranking['rank'],
                                                            created_timestamp=now))
        models.RequesterFeedRankings.objects.bulk_create(ranking_obj)
        config = request.user.userprofile.worker.configuration
        config.phase = 3
        config.save()
        return Response(data={"message": "Thank you"}, status=status.HTTP_201_CREATED)

    @list_route(methods=['get'])
    def sample_requesters(self, request, *args, **kwargs):
        query_1 = '''
            SELECT
              DISTINCT p.owner_id id
            FROM crowdsourcing_taskworker tw
              INNER JOIN crowdsourcing_task t ON tw.task_id = t.id
              INNER JOIN crowdsourcing_worker w ON tw.worker_id = w.id
              INNER JOIN crowdsourcing_project p ON t.project_id = p.id
              INNER JOIN crowdsourcing_requester r ON r.id = p.owner_id
            WHERE tw.worker_id = %(worker_id)s AND task_status<>6;
        '''
        projects = Project.objects.raw(query_1, params={'worker_id': request.user.userprofile.worker.id})
        requesters = []
        for requester in projects:
            requesters.append(requester.id)
        sample_size = 3
        if len(requesters) < 3:
            sample_size = len(requesters)
        requester_ids = random.sample(requesters, sample_size)
        query_2 = '''
            SELECT
              DISTINCT p.owner_id id
            FROM crowdsourcing_taskworker tw
              INNER JOIN crowdsourcing_task t ON tw.task_id = t.id
              INNER JOIN crowdsourcing_worker w ON tw.worker_id = w.id
              INNER JOIN crowdsourcing_project p ON t.project_id = p.id
              INNER JOIN crowdsourcing_requester r ON r.id = p.owner_id
            WHERE tw.worker_id = %(worker_id)s AND task_status<>6 AND p.owner_id IN %(owner_ids)s;
        '''
        projects_all = Project.objects.raw(query_2, params={'worker_id': request.user.userprofile.worker.id,
                                                            'owner_ids': tuple(requester_ids)})
        serializer = ProjectSerializer(instance=projects_all, many=True,
                                       fields=('id', 'name', 'owner', 'owner_id'),
                                       context={'request': request})
        choice_round = request.user.userprofile.worker.feed_choices.count()
        return Response(data={"data": serializer.data, "round": choice_round}, status=status.HTTP_200_OK)

    @list_route(methods=['post'])
    def post_choice(self, request, *args, **kwargs):
        sample = request.data.get('sample', [])
        pick = request.data.get('pick', -1)
        models.FeedChoices.objects.create(worker=request.user.userprofile.worker, sample=sample, requester_id=pick)
        return Response({'message': 'OK'}, status=status.HTTP_201_CREATED)
