# =====================================================================
# Image untuk deploy API Mahasiswa (CodeIgniter 4) ke Render (Docker).
# Database TIDAK ikut di sini: API terhubung ke PostgreSQL di Neon.
# Semua rahasia (password DB, JWT_SECRET) diisi lewat Environment
# Variables di dashboard Render, BUKAN lewat file .env.
# =====================================================================
FROM php:8.3-apache

# Ekstensi PHP yang dibutuhkan CI4 + PostgreSQL
RUN apt-get update \
 && apt-get install -y --no-install-recommends libpq-dev libicu-dev unzip git \
 && docker-php-ext-install pgsql intl \
 && a2enmod rewrite \
 && rm -rf /var/lib/apt/lists/*

# Mode production + agar environment variable Render terbaca oleh CodeIgniter ($_ENV)
RUN cp "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini" \
 && echo 'variables_order = "EGPCS"' > "$PHP_INI_DIR/conf.d/zz-env.ini"

# Document root diarahkan ke folder public/ dan .htaccess diizinkan
ENV APACHE_DOCUMENT_ROOT=/var/www/html/public
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf \
 && sed -ri -e 's/AllowOverride None/AllowOverride All/g' /etc/apache2/apache2.conf

# Render memberi nomor port lewat variabel PORT (bawaan 10000)
ENV PORT=10000
RUN sed -i 's/^Listen 80$/Listen ${PORT}/' /etc/apache2/ports.conf \
 && sed -i 's/<VirtualHost \*:80>/<VirtualHost *:${PORT}>/' /etc/apache2/sites-available/000-default.conf

# Kode aplikasi + library (vendor dibuat ulang di sini, tidak di-commit)
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
WORKDIR /var/www/html
COPY . .
RUN composer install --no-dev --optimize-autoloader --no-interaction \
 && chown -R www-data:www-data writable

EXPOSE 10000