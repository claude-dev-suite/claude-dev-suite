# Django Views Patterns

> **Knowledge Base:** Read `knowledge/django/views.md` for complete documentation.

## Function-Based Views

```python
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_http_methods
import json

@require_http_methods(["GET"])
def user_list(request):
    users = User.objects.filter(is_active=True).values('id', 'email', 'username')
    return JsonResponse(list(users), safe=False)

@require_http_methods(["GET"])
def user_detail(request, user_id):
    user = get_object_or_404(User, id=user_id)
    return JsonResponse({
        'id': user.id,
        'email': user.email,
        'username': user.username
    })

@require_http_methods(["POST"])
def user_create(request):
    data = json.loads(request.body)
    user = User.objects.create(**data)
    return JsonResponse({'id': user.id}, status=201)
```

## Class-Based Views

```python
from django.views import View
from django.views.generic import ListView, DetailView, CreateView, UpdateView

class UserListView(ListView):
    model = User
    template_name = 'users/list.html'
    context_object_name = 'users'
    paginate_by = 10

    def get_queryset(self):
        return User.objects.filter(is_active=True)

class UserDetailView(DetailView):
    model = User
    template_name = 'users/detail.html'
    context_object_name = 'user'

class UserCreateView(CreateView):
    model = User
    fields = ['email', 'username', 'bio']
    template_name = 'users/form.html'
    success_url = '/users/'
```

## API Views (Django REST Framework style)

```python
from django.http import JsonResponse
from django.views import View
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt

@method_decorator(csrf_exempt, name='dispatch')
class UserAPIView(View):
    def get(self, request, user_id=None):
        if user_id:
            user = get_object_or_404(User, id=user_id)
            return JsonResponse({'id': user.id, 'email': user.email})
        users = list(User.objects.values('id', 'email'))
        return JsonResponse(users, safe=False)

    def post(self, request):
        data = json.loads(request.body)
        user = User.objects.create(**data)
        return JsonResponse({'id': user.id}, status=201)

    def put(self, request, user_id):
        user = get_object_or_404(User, id=user_id)
        data = json.loads(request.body)
        for key, value in data.items():
            setattr(user, key, value)
        user.save()
        return JsonResponse({'id': user.id})

    def delete(self, request, user_id):
        user = get_object_or_404(User, id=user_id)
        user.delete()
        return JsonResponse({}, status=204)
```

## URL Routing

```python
# urls.py
from django.urls import path
from . import views

urlpatterns = [
    path('users/', views.UserListView.as_view(), name='user-list'),
    path('users/<int:pk>/', views.UserDetailView.as_view(), name='user-detail'),
    path('api/users/', views.UserAPIView.as_view(), name='user-api'),
    path('api/users/<int:user_id>/', views.UserAPIView.as_view(), name='user-api-detail'),
]
```

## Mixins

```python
from django.contrib.auth.mixins import LoginRequiredMixin, PermissionRequiredMixin

class UserUpdateView(LoginRequiredMixin, UpdateView):
    model = User
    fields = ['bio', 'avatar']
    login_url = '/login/'

class AdminUserView(PermissionRequiredMixin, ListView):
    model = User
    permission_required = 'users.view_all_users'
```

## Request/Response

```python
# Request data
request.GET.get('page', 1)
request.POST.get('email')
request.body  # Raw body
json.loads(request.body)  # JSON body
request.FILES['avatar']  # Uploaded file
request.user  # Authenticated user
request.headers.get('Authorization')

# Response
JsonResponse({'data': 'value'})
JsonResponse({'error': 'Not found'}, status=404)
HttpResponse('OK', content_type='text/plain')
```

**Official docs:** https://docs.djangoproject.com/en/stable/topics/class-based-views/
