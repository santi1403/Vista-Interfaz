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

-- Datos demo
IF NOT EXISTS (SELECT 1 FROM clientes WHERE identificacion='0102030405')
INSERT INTO clientes (num_cliente,tipo_id,identificacion,nombre,apellido,direccion,telefono,pais,fecha_desde,fecha_nacimiento) VALUES
('0001','CC','0102030405','María','González','Av. Amazonas 123','0991234567','Ecuador','2024-01-15','1990-05-20'),
('0002','CE','1723456789','Carlos','Ruiz','Calle 10 # 20-30','0987654321','Colombia','2023-11-02','1985-09-10'),
('0003','NIT','0933445566','Empresa','Soluciones SA','Parque Empresarial','022345678','Perú','2022-06-01','2000-01-01');
GO
IF NOT EXISTS (SELECT 1 FROM cliente_emails WHERE email='maria.gonzalez@mail.com')
INSERT INTO cliente_emails (cliente_id,email) VALUES (1,'maria.gonzalez@mail.com'),(2,'carlos.ruiz@mail.com'),(2,'c.ruiz@empresa.com'),(3,'contacto@soluciones.pe');
GO

SELECT * FROM clientes;
