# Django Models & ORM

> **Knowledge Base:** Read `knowledge/django/models.md` for complete documentation.

## Model Definition

```python
from django.db import models
from django.contrib.auth.models import AbstractUser

class User(AbstractUser):
    email = models.EmailField(unique=True)
    bio = models.TextField(blank=True)
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

class Post(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        PUBLISHED = 'published', 'Published'

    title = models.CharField(max_length=200)
    slug = models.SlugField(unique=True)
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name='posts')
    content = models.TextField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    published_at = models.DateTimeField(null=True, blank=True)
    tags = models.ManyToManyField('Tag', related_name='posts')

    class Meta:
        ordering = ['-published_at']
        indexes = [models.Index(fields=['slug'])]

    def __str__(self):
        return self.title
```

## QuerySet Operations

```python
# Basic queries
User.objects.all()
User.objects.get(id=1)
User.objects.filter(is_active=True)
User.objects.exclude(is_staff=True)

# Chaining
Post.objects.filter(status='published').order_by('-published_at')[:10]

# Field lookups
Post.objects.filter(title__icontains='django')
Post.objects.filter(published_at__year=2024)
Post.objects.filter(author__email__endswith='@example.com')

# Q objects (OR queries)
from django.db.models import Q
Post.objects.filter(Q(status='published') | Q(author=user))

# Aggregation
from django.db.models import Count, Avg
User.objects.annotate(post_count=Count('posts'))
Post.objects.aggregate(avg_views=Avg('views'))
```

## Related Objects

```python
# Forward relation
post.author.email

# Reverse relation
user.posts.all()
user.posts.filter(status='published')

# Prefetch for performance
User.objects.prefetch_related('posts')
Post.objects.select_related('author')

# Create related
user.posts.create(title='New Post', content='...')
```

## CRUD Operations

```python
# Create
user = User.objects.create(email='user@example.com', username='user')
user = User(email='user@example.com')
user.save()

# Update
user.email = 'new@example.com'
user.save()

Post.objects.filter(status='draft').update(status='published')

# Delete
user.delete()
Post.objects.filter(published_at__lt=cutoff).delete()

# Get or create
user, created = User.objects.get_or_create(
    email='user@example.com',
    defaults={'username': 'user'}
)

# Update or create
user, created = User.objects.update_or_create(
    email='user@example.com',
    defaults={'bio': 'Updated bio'}
)
```

## Model Managers

```python
class PublishedManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(status='published')

class Post(models.Model):
    # ...
    objects = models.Manager()  # Default
    published = PublishedManager()  # Custom

# Usage
Post.published.all()  # Only published posts
```

**Official docs:** https://docs.djangoproject.com/en/stable/topics/db/models/
