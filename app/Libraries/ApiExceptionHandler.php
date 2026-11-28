<?php

namespace App\Libraries;

use CodeIgniter\Debug\ExceptionHandler;
use CodeIgniter\Debug\ExceptionHandlerInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;
use Config\Exceptions as ExceptionsConfig;
use Throwable;

/**
 * Untuk request ke /api/... di mode production:
 * error yang tidak tertangani tetap dijawab dengan format JSON seragam
 * {status, message, data} tanpa membocorkan detail server (K5).
 * Selain itu (mode development, atau halaman non-API) dipakai handler bawaan CodeIgniter.
 */
class ApiExceptionHandler implements ExceptionHandlerInterface
{
    private ExceptionHandler $bawaan;

    public function __construct(ExceptionsConfig $config)
    {
        $this->bawaan = new ExceptionHandler($config);
    }

    public function handle(
        Throwable $exception,
        RequestInterface $request,
        ResponseInterface $response,
        int $statusCode,
        int $exitCode,
    ): void {
        $path = method_exists($request, 'getPath') ? ltrim((string) $request->getPath(), '/') : '';

        if (ENVIRONMENT !== 'production' || ! str_starts_with($path, 'api/')) {
            $this->bawaan->handle($exception, $request, $response, $statusCode, $exitCode);

            return;
        }

        if ($statusCode < 400 || $statusCode > 599) {
            $statusCode = 500;
        }
        $pesan = match ($statusCode) {
            404     => 'Endpoint tidak ditemukan',
            405     => 'Method tidak diizinkan',
            default => 'Terjadi kesalahan pada server',
        };

        $response->setStatusCode($statusCode)
            ->setJSON(['status' => 'error', 'message' => $pesan, 'data' => null])
            ->send();

        exit($exitCode);
    }
}