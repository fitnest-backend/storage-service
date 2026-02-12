// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('@grpc/grpc-js');
var proto_worker_pb = require('../proto/worker_pb.js');

function serialize_az_fitnest_terabox_DeleteFilesRequest(arg) {
  if (!(arg instanceof proto_worker_pb.DeleteFilesRequest)) {
    throw new Error('Expected argument of type az.fitnest.terabox.DeleteFilesRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_az_fitnest_terabox_DeleteFilesRequest(buffer_arg) {
  return proto_worker_pb.DeleteFilesRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_az_fitnest_terabox_DeleteFilesResponse(arg) {
  if (!(arg instanceof proto_worker_pb.DeleteFilesResponse)) {
    throw new Error('Expected argument of type az.fitnest.terabox.DeleteFilesResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_az_fitnest_terabox_DeleteFilesResponse(buffer_arg) {
  return proto_worker_pb.DeleteFilesResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_az_fitnest_terabox_DownloadFileRequest(arg) {
  if (!(arg instanceof proto_worker_pb.DownloadFileRequest)) {
    throw new Error('Expected argument of type az.fitnest.terabox.DownloadFileRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_az_fitnest_terabox_DownloadFileRequest(buffer_arg) {
  return proto_worker_pb.DownloadFileRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_az_fitnest_terabox_DownloadFileResponse(arg) {
  if (!(arg instanceof proto_worker_pb.DownloadFileResponse)) {
    throw new Error('Expected argument of type az.fitnest.terabox.DownloadFileResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_az_fitnest_terabox_DownloadFileResponse(buffer_arg) {
  return proto_worker_pb.DownloadFileResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_az_fitnest_terabox_FetchFileListRequest(arg) {
  if (!(arg instanceof proto_worker_pb.FetchFileListRequest)) {
    throw new Error('Expected argument of type az.fitnest.terabox.FetchFileListRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_az_fitnest_terabox_FetchFileListRequest(buffer_arg) {
  return proto_worker_pb.FetchFileListRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_az_fitnest_terabox_FetchFileListResponse(arg) {
  if (!(arg instanceof proto_worker_pb.FetchFileListResponse)) {
    throw new Error('Expected argument of type az.fitnest.terabox.FetchFileListResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_az_fitnest_terabox_FetchFileListResponse(buffer_arg) {
  return proto_worker_pb.FetchFileListResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_az_fitnest_terabox_MoveFileRequest(arg) {
  if (!(arg instanceof proto_worker_pb.MoveFileRequest)) {
    throw new Error('Expected argument of type az.fitnest.terabox.MoveFileRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_az_fitnest_terabox_MoveFileRequest(buffer_arg) {
  return proto_worker_pb.MoveFileRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_az_fitnest_terabox_MoveFileResponse(arg) {
  if (!(arg instanceof proto_worker_pb.MoveFileResponse)) {
    throw new Error('Expected argument of type az.fitnest.terabox.MoveFileResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_az_fitnest_terabox_MoveFileResponse(buffer_arg) {
  return proto_worker_pb.MoveFileResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_az_fitnest_terabox_UploadFileRequest(arg) {
  if (!(arg instanceof proto_worker_pb.UploadFileRequest)) {
    throw new Error('Expected argument of type az.fitnest.terabox.UploadFileRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_az_fitnest_terabox_UploadFileRequest(buffer_arg) {
  return proto_worker_pb.UploadFileRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_az_fitnest_terabox_UploadFileResponse(arg) {
  if (!(arg instanceof proto_worker_pb.UploadFileResponse)) {
    throw new Error('Expected argument of type az.fitnest.terabox.UploadFileResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_az_fitnest_terabox_UploadFileResponse(buffer_arg) {
  return proto_worker_pb.UploadFileResponse.deserializeBinary(new Uint8Array(buffer_arg));
}


var TeraBoxWorkerService = exports.TeraBoxWorkerService = {
  uploadFile: {
    path: '/az.fitnest.terabox.TeraBoxWorker/UploadFile',
    requestStream: false,
    responseStream: false,
    requestType: proto_worker_pb.UploadFileRequest,
    responseType: proto_worker_pb.UploadFileResponse,
    requestSerialize: serialize_az_fitnest_terabox_UploadFileRequest,
    requestDeserialize: deserialize_az_fitnest_terabox_UploadFileRequest,
    responseSerialize: serialize_az_fitnest_terabox_UploadFileResponse,
    responseDeserialize: deserialize_az_fitnest_terabox_UploadFileResponse,
  },
  fetchFileList: {
    path: '/az.fitnest.terabox.TeraBoxWorker/FetchFileList',
    requestStream: false,
    responseStream: false,
    requestType: proto_worker_pb.FetchFileListRequest,
    responseType: proto_worker_pb.FetchFileListResponse,
    requestSerialize: serialize_az_fitnest_terabox_FetchFileListRequest,
    requestDeserialize: deserialize_az_fitnest_terabox_FetchFileListRequest,
    responseSerialize: serialize_az_fitnest_terabox_FetchFileListResponse,
    responseDeserialize: deserialize_az_fitnest_terabox_FetchFileListResponse,
  },
  downloadFile: {
    path: '/az.fitnest.terabox.TeraBoxWorker/DownloadFile',
    requestStream: false,
    responseStream: false,
    requestType: proto_worker_pb.DownloadFileRequest,
    responseType: proto_worker_pb.DownloadFileResponse,
    requestSerialize: serialize_az_fitnest_terabox_DownloadFileRequest,
    requestDeserialize: deserialize_az_fitnest_terabox_DownloadFileRequest,
    responseSerialize: serialize_az_fitnest_terabox_DownloadFileResponse,
    responseDeserialize: deserialize_az_fitnest_terabox_DownloadFileResponse,
  },
  moveFile: {
    path: '/az.fitnest.terabox.TeraBoxWorker/MoveFile',
    requestStream: false,
    responseStream: false,
    requestType: proto_worker_pb.MoveFileRequest,
    responseType: proto_worker_pb.MoveFileResponse,
    requestSerialize: serialize_az_fitnest_terabox_MoveFileRequest,
    requestDeserialize: deserialize_az_fitnest_terabox_MoveFileRequest,
    responseSerialize: serialize_az_fitnest_terabox_MoveFileResponse,
    responseDeserialize: deserialize_az_fitnest_terabox_MoveFileResponse,
  },
  deleteFiles: {
    path: '/az.fitnest.terabox.TeraBoxWorker/DeleteFiles',
    requestStream: false,
    responseStream: false,
    requestType: proto_worker_pb.DeleteFilesRequest,
    responseType: proto_worker_pb.DeleteFilesResponse,
    requestSerialize: serialize_az_fitnest_terabox_DeleteFilesRequest,
    requestDeserialize: deserialize_az_fitnest_terabox_DeleteFilesRequest,
    responseSerialize: serialize_az_fitnest_terabox_DeleteFilesResponse,
    responseDeserialize: deserialize_az_fitnest_terabox_DeleteFilesResponse,
  },
};

exports.TeraBoxWorkerClient = grpc.makeGenericClientConstructor(TeraBoxWorkerService, 'TeraBoxWorker');
