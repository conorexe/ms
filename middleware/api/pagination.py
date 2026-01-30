from rest_framework.pagination import PageNumberPagination


class LargeResultsSetPagination(PageNumberPagination):
    """
    Custom pagination that allows larger page sizes for backtest data.
    Use ?page_size=N to request up to 5000 results per page.
    """
    page_size = 100
    page_size_query_param = 'page_size'
    max_page_size = 5000
