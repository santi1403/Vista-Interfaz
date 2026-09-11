<?php
// api.php - Deshabilitado (MySQL removido) - modo localStorage
// Para MySQL Express futuro, restaurar logica aqui
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
http_response_code(503);
echo json_encode(['ok'=>false,'error'=>'API MySQL deshabilitada - modo local activo']);
