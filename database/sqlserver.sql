-- SQL Server - CAJAIMPORTADOS\SQLINTERFAZ - Ejecutar en SSMS (Nueva consulta -> Ejecutar)
IF DB_ID('gestion_clientes') IS NULL CREATE DATABASE gestion_clientes;
GO
USE gestion_clientes;
GO

-- Tabla principal
IF OBJECT_ID('clientes','U') IS NULL
CREATE TABLE clientes (
  id INT IDENTITY(1,1) PRIMARY KEY,
  num_cliente VARCHAR(10) UNIQUE,
  tipo_id VARCHAR(10) NOT NULL CHECK (tipo_id IN ('CC','CE','TI','PA','NIT','PEP','PPT','Otro')),
  identificacion VARCHAR(20) NOT NULL UNIQUE,
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  direccion VARCHAR(255) NULL,
  telefono VARCHAR(20) NULL,
  pais VARCHAR(50) NULL,
  fecha_desde DATE NULL,
  fecha_nacimiento DATE NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','suspendido')),
  check_id VARCHAR(32) NULL,
  created_at DATETIME DEFAULT GETDATE(),
  updated_at DATETIME DEFAULT GETDATE(),
  CONSTRAINT chk_identificacion_len CHECK (LEN(identificacion) BETWEEN 3 AND 20)
);
GO

-- Tabla hija emails
IF OBJECT_ID('cliente_emails','U') IS NULL
CREATE TABLE cliente_emails (
  id INT IDENTITY(1,1) PRIMARY KEY,
  cliente_id INT NOT NULL FOREIGN KEY REFERENCES clientes(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  UNIQUE (cliente_id, email)
);
GO

-- Tabla intermedia factura_cliente
IF OBJECT_ID('factura_cliente','U') IS NULL
CREATE TABLE factura_cliente (
  id INT IDENTITY(1,1) PRIMARY KEY,
  check_id VARCHAR(50) UNIQUE NOT NULL,
  usuario_id INT NOT NULL FOREIGN KEY REFERENCES clientes(id) ON DELETE CASCADE,
  fecha_vinculacion DATETIME DEFAULT GETDATE()
);
GO

-- Ver clientes registrados (los datos se gestionan desde la interfaz/API)
SELECT * FROM clientes;

-- Ver clientes con sus correos
SELECT c.id, c.num_cliente, c.tipo_id, c.identificacion, c.nombre, c.apellido, c.pais, c.estado,
       STRING_AGG(e.email, ', ') AS emails
FROM clientes c
LEFT JOIN cliente_emails e ON e.cliente_id = c.id
GROUP BY c.id, c.num_cliente, c.tipo_id, c.identificacion, c.nombre, c.apellido, c.pais, c.estado
ORDER BY c.id;
