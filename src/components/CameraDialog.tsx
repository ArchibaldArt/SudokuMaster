import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Check, LoaderCircle, RotateCcw, Upload } from 'lucide-react'
import { Dialog } from './Dialog'

type Phase = 'opening' | 'live' | 'captured' | 'paused' | 'error'
type Snapshot = { file: File; url: string }

function cameraError(error: unknown) {
  const name = error instanceof Error ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Доступ к камере не разрешён. Разрешите его в настройках сайта или загрузите готовое фото.'
  if (name === 'NotFoundError') return 'Камера не найдена. Подключите её или загрузите готовое фото.'
  if (name === 'NotReadableError' || name === 'AbortError')
    return 'Камера недоступна. Возможно, её использует другое приложение. Закройте его и попробуйте ещё раз.'
  return 'Не удалось включить камеру. Попробуйте ещё раз или загрузите готовое фото.'
}

export function CameraDialog({
  onCapture,
  onClose,
  onUpload,
}: {
  onCapture: (file: File) => void
  onClose: () => void
  onUpload: () => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const generation = useRef(0)
  const snapshotRef = useRef<Snapshot | null>(null)
  const selectedDevice = useRef('')
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [phase, setPhase] = useState<Phase>('opening')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const supported = window.isSecureContext && !!navigator.mediaDevices?.getUserMedia

  const stop = useCallback(() => {
    generation.current++
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
    if (video.current) video.current.srcObject = null
  }, [])
  const discardSnapshot = useCallback(() => {
    if (snapshotRef.current) URL.revokeObjectURL(snapshotRef.current.url)
    snapshotRef.current = null
    setSnapshot(null)
  }, [])
  const start = useCallback(
    async (deviceId = selectedDevice.current) => {
      stop()
      discardSnapshot()
      setReady(false)
      setCapturing(false)
      setError('')
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setPhase('error')
        setError(
          !window.isSecureContext
            ? 'Для съёмки откройте сайт по HTTPS. На этом адресе можно загрузить готовое фото.'
            : 'Этот браузер не поддерживает съёмку. Откройте SudokuMaster в другом браузере или загрузите фото.',
        )
        return
      }
      const request = generation.current
      setPhase('opening')
      try {
        const next = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }),
            width: { ideal: 2560 },
            height: { ideal: 1920 },
          },
        })
        if (request !== generation.current) {
          next.getTracks().forEach((track) => track.stop())
          return
        }
        stream.current = next
        selectedDevice.current = next.getVideoTracks()[0]?.getSettings().deviceId ?? deviceId
        next.getVideoTracks()[0]?.addEventListener(
          'ended',
          () => {
            if (request !== generation.current) return
            stop()
            setReady(false)
            setPhase('paused')
          },
          { once: true },
        )
        video.current!.srcObject = next
        await video.current!.play()
        if (request !== generation.current) return
        setReady(video.current!.readyState >= 2 && video.current!.videoWidth > 0)
        setPhase('live')
        try {
          const available = await navigator.mediaDevices.enumerateDevices()
          if (request === generation.current)
            setDevices(available.filter((device) => device.kind === 'videoinput'))
        } catch {
          /* Camera selection is optional when device enumeration is unavailable. */
        }
      } catch (e) {
        if (request !== generation.current) return
        stop()
        setError(cameraError(e))
        setPhase('error')
      }
    },
    [stop, discardSnapshot],
  )

  useEffect(() => {
    void start()
    const suspend = () => {
      if (snapshotRef.current) return
      stop()
      setReady(false)
      setPhase('paused')
    }
    const visibility = () => {
      if (document.hidden) suspend()
    }
    window.addEventListener('pagehide', suspend)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      stop()
      if (snapshotRef.current) URL.revokeObjectURL(snapshotRef.current.url)
      window.removeEventListener('pagehide', suspend)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [start, stop])

  const capture = async () => {
    if (!video.current || !ready || capturing) return
    const request = generation.current
    setCapturing(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.current.videoWidth
      canvas.height = video.current.videoHeight
      canvas.getContext('2d')!.drawImage(video.current, 0, 0)
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error('Не удалось сохранить кадр'))),
          'image/jpeg',
          0.95,
        ),
      )
      if (request !== generation.current) return
      stop()
      const next = {
        file: new File([blob], `sudoku-camera-${Date.now()}.jpg`, { type: 'image/jpeg' }),
        url: URL.createObjectURL(blob),
      }
      snapshotRef.current = next
      setSnapshot(next)
      setPhase('captured')
    } catch {
      if (request !== generation.current) return
      stop()
      setError('Не удалось сделать снимок. Попробуйте ещё раз.')
      setPhase('error')
    } finally {
      if (request === generation.current || snapshotRef.current) setCapturing(false)
    }
  }
  return (
    <Dialog title="Сделать фото" onClose={onClose} className="camera-dialog">
      <p className="dialog-description">
        {snapshot
          ? 'Убедитесь, что числа хорошо видны.'
          : 'Поместите всё поле в кадр. Держите камеру прямо и неподвижно.'}
      </p>
      <div className="camera-stage">
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          aria-label="Предпросмотр камеры"
          hidden={phase !== 'opening' && phase !== 'live'}
          onLoadedData={() => setReady(!!stream.current && !!video.current?.videoWidth)}
        />
        {snapshot && <img src={snapshot.url} alt="Снимок судоку с камеры" />}
        {phase === 'opening' && (
          <div className="camera-message" role="status">
            <LoaderCircle className="spin" size={28} />
            <p>Ожидаем доступ к камере…</p>
          </div>
        )}
        {phase === 'paused' && (
          <div className="camera-message" role="status">
            <Camera size={32} />
            <p>Камера выключена</p>
            <button className="button secondary" onClick={() => void start()}>
              Включить камеру
            </button>
          </div>
        )}
        {phase === 'error' && (
          <div className="camera-message">
            <Camera size={32} />
            <p role="alert">{error}</p>
            {supported && (
              <button className="button secondary" onClick={() => void start()}>
                Попробовать ещё раз
              </button>
            )}
          </div>
        )}
      </div>
      {devices.length > 1 && phase === 'live' && (
        <label className="camera-choice">
          Камера
          <select
            aria-label="Выбор камеры"
            value={selectedDevice.current}
            onChange={(event) => void start(event.target.value)}
          >
            {devices.map((device, index) => (
              <option value={device.deviceId} key={device.deviceId}>
                {device.label || `Камера ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="dialog-actions">
        {snapshot ? (
          <>
            <button className="button secondary" onClick={() => void start()}>
              <RotateCcw size={18} />
              Переснять
            </button>
            <button className="button primary" onClick={() => onCapture(snapshot.file)}>
              <Check size={20} />
              Использовать фото
            </button>
          </>
        ) : (
          <>
            <button className="button secondary" onClick={onUpload}>
              <Upload size={18} />
              Загрузить фото
            </button>
            <button
              className="button primary"
              disabled={phase !== 'live' || !ready || capturing}
              onClick={() => void capture()}
            >
              <Camera size={20} />
              {capturing ? 'Снимаем…' : 'Снять фото'}
            </button>
          </>
        )}
      </div>
    </Dialog>
  )
}
