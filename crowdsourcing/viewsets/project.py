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
                                               'is_prototype', 'templates', 'status', 'batch_files', 'completion_time',
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
        projects = Project.objects.filter(Q(project_tasks__task_workers__worker_id=request.user.userprofile.worker),
                                          ~Q(project_tasks__task_workers__task_status=TaskWorker.STATUS_SKIPPED),
                                          deleted=False).distinct()
        serializer = ProjectSerializer(instance=projects, many=True,
                                       fields=('id', 'name', 'owner', 'status', 'owner_id'),
                                       context={'request': request})
        return Response(data=serializer.data, status=status.HTTP_200_OK)

    @list_route(methods=['get'])
    def list_feed(self, request, **kwargs):
        from django.utils.timezone import utc
        last_login = request.user.last_login
        now = datetime.utcnow().replace(tzinfo=utc)
        if (now - last_login).total_seconds() / 60 >= settings.STUDY_FEED_TIME:
            return Response(data={"message": "Time is up, thank you so much, you may close this window now!"},
                            status=status.HTTP_410_GONE)
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
                                        IS NOT NULL THEN requester_avg_rating
                                    WHEN requester_rating IS NULL AND requester_avg_rating IS NULL THEN 1.99
                                    WHEN requester_rating IS NOT NULL AND requester_avg_rating IS NULL
                                    THEN requester_rating
                                    ELSE requester_rating + 0.1 * requester_avg_rating END requester_rating
                                   FROM get_requester_ratings(%(worker_profile)s)) requester_ratings
                    ON requester_ratings.requester_id = ratings.owner_id
                  )
            select * from projects p
        INNER JOIN crowdsourcing_project cp on p.project_id= cp.id
        ORDER BY p.requester_rating DESC;
        '''
        projects = Project.objects.raw(query, params={'worker_profile': request.user.userprofile.id})
        project_serializer = ProjectSerializer(instance=projects, many=True,
                                               fields=('id', 'name',
                                                       'status',
                                                       'available_tasks',
                                                       'price', 'task_time',
                                                       'owner',
                                                       'requester_rating', 'raw_rating',
                                                       'is_prototype',
                                                       'completion_time'
                                                       ),
                                               context={'request': request})
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
        return Response(data={"message": "Thank you"}, status=status.HTTP_201_CREATED)
