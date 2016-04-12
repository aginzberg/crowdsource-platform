from django.shortcuts import render
from rest_framework import views as rest_framework_views
from rest_framework.views import APIView
from django.utils.translation import ugettext_lazy as _
from django.views.decorators.csrf import csrf_protect
from django.utils.decorators import method_decorator

from rest_framework.response import Response

from crowdsourcing.serializers.user import *
from crowdsourcing.serializers.project import *
from crowdsourcing.utils import *
from crowdsourcing.models import *
from crowdsourcing.utils import get_model_or_none


class JSONResponse(HttpResponse):
    """
    An HttpResponse that renders its content into JSON.
    """

    def __init__(self, data, **kwargs):
        content = JSONRenderer().render(data)
        kwargs['content_type'] = 'application/json'
        super(JSONResponse, self).__init__(content, **kwargs)


class Logout(APIView):
    def post(self, request, *args, **kwargs):
        from django.contrib.auth import logout
        logout(request)
        return Response({}, status=status.HTTP_204_NO_CONTENT)


class Login(APIView):
    method_decorator(csrf_protect)

    def post(self, request, *args, **kwargs):
        from django.contrib.auth import authenticate as auth_authenticate, login
        # self.redirect_to = request.POST.get('next', '') #to be changed, POST does not contain any data

        username = request.data.get('username', '')
        password = request.data.get('password', '')
        email_or_username = username
        # Sorry about this
        if str(settings.STUDY_URL_AUTH) == 'True':
            url_auth = get_model_or_none(URLAuth, token=request.data.get('token', ''))
            if url_auth is not None:
                email_or_username = url_auth.username
                password = url_auth.password
        # match with username if not email
        if not re.match(r"[^@]+@[^@]+\.[^@]+", email_or_username):
            username = email_or_username
        else:
            user = get_model_or_none(User, email=email_or_username)
            if user is not None:
                username = user.username

        user = auth_authenticate(username=username, password=password)

        if user is not None:

            if not user.is_anonymous():
                userprofile = user.userprofile
                userprofile.last_active = timezone.now()
                userprofile.save()

            if user.is_active:
                login(request, user)
                response_data = dict()
                response_data["username"] = user.username
                response_data["email"] = user.email
                response_data["first_name"] = user.first_name
                response_data["last_name"] = user.last_name
                response_data["date_joined"] = user.date_joined
                response_data["last_login"] = user.last_login
                response_data["is_requester"] = hasattr(request.user.userprofile, 'requester')
                response_data["is_worker"] = hasattr(request.user.userprofile, 'worker')
                if hasattr(request.user.userprofile, 'worker') and hasattr(request.user.userprofile.worker,
                                                                           'configuration'):
                    response_data["configuration"] = {
                        "condition": request.user.userprofile.worker.configuration.condition
                    }
                if hasattr(request.user.userprofile, 'requester') and hasattr(request.user.userprofile.requester,
                                                                              'configuration'):
                    response_data["requester_configuration"] = {
                        "condition": request.user.userprofile.requester.configuration.condition
                    }

                return Response(response_data, status.HTTP_200_OK)
            else:
                raise AuthenticationFailed(_('Account is not activated yet.'))
        else:
            raise AuthenticationFailed(_('Username or password is incorrect.'))


class Oauth2TokenView(rest_framework_views.APIView):
    def post(self, request, *args, **kwargs):
        oauth2_login = Oauth2Utils()
        response_data, oauth2_status = oauth2_login.get_token(request)
        return Response(response_data, status=oauth2_status)


# Will be moved to Class Views
#################################################
def registration_successful(request):
    return render(request, 'registration/registration_successful.html')


def home(request):
    if request.user.is_authenticated():
        return render(request, 'index.html')
    # return render(request, 'homepage.html')
    return render(request, 'index.html')


def load_requester_data(request):
    from crowdsourcing.models import ReviewableTask, ReviewableAssignment
    from fixtures.requester_data import new_data as data

    for i, r in enumerate(data):
        rd = ReviewableTask()
        rd.entry = r['Queries']
        rd.task_id = i+1
        rd.save()
        ra = ReviewableAssignment()
        ra.worker_id = 'worker' + str(rd.id) + str(i + 1)
        ra.answer = r['Answer']
        ra.task_id = rd
        if r['Accept'] == "T":
            ra.status = 2
        else:
            ra.status = 1
        ra.save()
    return render(request, 'index.html')
