from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ExchangeViewSet, PriceSnapshotViewSet, ArbitrageEventViewSet

router = DefaultRouter()
router.register(r'exchanges', ExchangeViewSet)
router.register(r'prices', PriceSnapshotViewSet)
router.register(r'opportunities', ArbitrageEventViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
